import "server-only";

import { get, put } from "@vercel/blob";

import {
  buildScorePayloadFromLanding,
  computeFactorScores,
  scoreCardScoutWithClaude,
} from "@/lib/cardScoutScore";
import { getEbayMedianAndCountForPlayer } from "@/lib/dealFinder";
import { fetchPlayerLanding } from "./nhlPlayerLanding";
import { getPlayerLandingCached } from "./nhlPlayerLandingCached";

const CURRENT_SEASON_ID = 20252026;
const PREV_SEASON_ID = 20242025;
const PAGE_LIMIT = 100;
const MIN_GAMES_PLAYED = 10;
const MAX_AGE = 30;
const TOP_OPPORTUNITIES_RETURN = 8;
const TOP_SCORING_POOL = 75;

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const BLOB_CACHE_PATHNAME = "opportunites-cache.json";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const CLAUDE_NARRATIVE_SYSTEM_PROMPT = `Tu es le meilleur expert mondial en investissement de cartes NHL.

Les 8 joueurs suivants ont DÉJÀ été sélectionnés et classés par le Card Scout Score (7 facteurs mathématiques + marché eBay). Tu ne choisis PAS qui figure dans la liste et tu ne modifies PAS les scores.

Pour CHACUN des 8 joueurs (dans l'ordre donné), rédige uniquement :
- verdict : "Acheter maintenant" | "Fort potentiel" | "À surveiller"
- headline : 1 phrase percutante (ex: "Le prochain grand de Montréal")
- reasoning : 2-3 phrases d'analyse spécifique au joueur et aux cartes
- cardRecommendations : 1 à 3 cartes concrètes à cibler (Young Guns, autos, etc.)
- risks : 1 phrase sur les risques (blessure, trade, baisse de forme)

Considère : trajectoire, rôle franchise vs role player, marché canadien, liquidité eBay, fenêtre d'appréciation 1-3 saisons.

Réponds UNIQUEMENT en JSON valide, aucun texte avant ou après.`;

/** @type {{ fetchedAt: number; payload: object | null }} */
let topOpportunitiesCache = { fetchedAt: 0, payload: null };

function isBlobCacheEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * @param {number} fetchedAt
 */
function isCacheEntryFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CACHE_TTL_MS;
}

/**
 * @returns {Promise<{ fetchedAt: number; payload: object } | null>}
 */
async function readOpportunitesCacheFromBlob() {
  if (!isBlobCacheEnabled()) return null;
  try {
    const result = await get(BLOB_CACHE_PATHNAME, { access: "private" });
    if (!result.stream) return null;
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    const fetchedAt = Number(parsed?.fetchedAt);
    const payload = parsed?.payload;
    if (!payload || !isCacheEntryFresh(fetchedAt)) return null;
    return { fetchedAt, payload };
  } catch {
    return null;
  }
}

/**
 * @param {{ fetchedAt: number; payload: object }} entry
 */
async function writeOpportunitesCacheToBlob(entry) {
  if (!isBlobCacheEnabled()) return;
  try {
    await put(BLOB_CACHE_PATHNAME, JSON.stringify(entry), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    console.error(
      "[opportunitesTop] Échec écriture blob:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * @param {{ fetchedAt: number; payload: object }} entry
 */
function setMemoryCache(entry) {
  topOpportunitiesCache = entry;
}

/**
 * @param {unknown} birthDate
 * @returns {number | null}
 */
function ageYearsFromBirthDate(birthDate) {
  if (birthDate == null || birthDate === "") return null;
  const d = new Date(String(birthDate).trim());
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 55 ? age : null;
}

/**
 * @param {string} text
 * @returns {object | null}
 */
function extractJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Stats NHL : seasonId/gameTypeId en query renvoie 500 — filtre via cayenneExp.
 * @param {number} seasonId
 * @param {number} start
 * @returns {string}
 */
function buildSkaterSummaryUrl(seasonId, start) {
  const cayenne = `seasonId=${seasonId} and gameTypeId=2`;
  return `https://api.nhle.com/stats/rest/en/skater/summary?limit=100&start=${start}&sort=points&dir=DESC&isAggregate=false&isGame=false&cayenneExp=${encodeURIComponent(cayenne)}`;
}

/**
 * URL bios demandée (query seasonId) — souvent 500 côté NHL.
 * @param {number} start
 * @returns {string}
 */
function buildSkaterBiosPrimaryUrl(start) {
  const biosUrl = `https://api.nhle.com/stats/rest/en/skater/bios?limit=100&start=${start}&seasonId=${CURRENT_SEASON_ID}&gameTypeId=2`;
  return biosUrl;
}

/**
 * Bios via cayenneExp (fallback fiable, inclut birthDate).
 * @param {number} seasonId
 * @param {number} start
 * @returns {string}
 */
function buildSkaterBiosFallbackUrl(seasonId, start) {
  const cayenne = `seasonId=${seasonId} and gameTypeId=2`;
  return `https://api.nhle.com/stats/rest/en/skater/bios?limit=100&start=${start}&sort=points&dir=DESC&isAggregate=false&isGame=false&cayenneExp=${encodeURIComponent(cayenne)}`;
}

/**
 * @param {string} url
 */
async function fetchNhlStatsJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CardScout/1.0 (opportunites-top)",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`NHL stats ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * @param {number} seasonId
 * @param {number} start
 */
async function fetchSummaryPage(seasonId, start) {
  const url = buildSkaterSummaryUrl(seasonId, start);
  return fetchNhlStatsJson(url);
}

/**
 * @param {number} start
 * @param {number} seasonId
 */
async function fetchBiosPage(start, seasonId) {
  const primaryUrl = buildSkaterBiosPrimaryUrl(start);
  try {
    return await fetchNhlStatsJson(primaryUrl);
  } catch (primaryErr) {
    const fallbackUrl = buildSkaterBiosFallbackUrl(seasonId, start);
    try {
      return await fetchNhlStatsJson(fallbackUrl);
    } catch {
      throw primaryErr;
    }
  }
}

/**
 * @param {number} seasonId
 */
async function fetchAllSummaryForSeason(seasonId) {
  const first = await fetchSummaryPage(seasonId, 0);
  const total = Number(first?.total ?? 0);
  const data = Array.isArray(first?.data) ? [...first.data] : [];
  const starts = [];
  for (let s = PAGE_LIMIT; s < total; s += PAGE_LIMIT) {
    starts.push(s);
  }
  const chunkSize = 5;
  for (let i = 0; i < starts.length; i += chunkSize) {
    const chunk = starts.slice(i, i + chunkSize);
    const pages = await Promise.all(
      chunk.map((st) => fetchSummaryPage(seasonId, st))
    );
    for (const p of pages) {
      if (Array.isArray(p?.data)) data.push(...p.data);
    }
  }
  return data;
}

/**
 * @param {number} seasonId
 */
async function fetchAllBiosForSeason(seasonId) {
  const first = await fetchBiosPage(0, seasonId);
  const total = Number(first?.total ?? 0);
  const data = Array.isArray(first?.data) ? [...first.data] : [];
  const starts = [];
  for (let s = PAGE_LIMIT; s < total; s += PAGE_LIMIT) {
    starts.push(s);
  }
  const chunkSize = 5;
  for (let i = 0; i < starts.length; i += chunkSize) {
    const chunk = starts.slice(i, i + chunkSize);
    const pages = await Promise.all(
      chunk.map((st) => fetchBiosPage(st, seasonId))
    );
    for (const p of pages) {
      if (Array.isArray(p?.data)) data.push(...p.data);
    }
  }
  return data;
}

/**
 * Complète birthDate via l'API landing quand bios/summary n'en ont pas.
 * @param {Map<number, Record<string, unknown>>} biosById
 * @param {Array<Record<string, unknown>>} summaryRows
 */
async function enrichBirthDatesFromLanding(biosById, summaryRows) {
  const needIds = [];
  for (const row of summaryRows) {
    const id = Number(row.playerId);
    if (!Number.isFinite(id)) continue;
    const bio = biosById.get(id);
    if (bio?.birthDate || row.birthDate) continue;
    needIds.push(id);
  }
  const chunkSize = 8;
  for (let i = 0; i < needIds.length; i += chunkSize) {
    const chunk = needIds.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (id) => {
        const landing = await fetchPlayerLanding(id);
        const birthDate = landing?.birthDate;
        if (!birthDate) return;
        const existing = biosById.get(id) ?? {};
        biosById.set(id, { ...existing, birthDate });
      })
    );
  }
}

/**
 * @param {Record<string, unknown>} summaryRow
 * @param {Record<string, unknown>} bioRow
 */
function buildCandidate(summaryRow, bioRow) {
  const playerId = Number(summaryRow.playerId ?? bioRow.playerId);
  if (!Number.isFinite(playerId)) return null;

  const positionCode = String(
    summaryRow.positionCode ?? bioRow.positionCode ?? ""
  ).toUpperCase();
  if (positionCode === "G") return null;

  const gamesPlayed = Number(summaryRow.gamesPlayed);
  const goals = Number(summaryRow.goals);
  const assists = Number(summaryRow.assists);
  const points = Number(summaryRow.points);
  if (!Number.isFinite(gamesPlayed) || gamesPlayed < MIN_GAMES_PLAYED) return null;
  if (!Number.isFinite(points)) return null;

  const birthDate = bioRow.birthDate ?? summaryRow.birthDate;
  const age = ageYearsFromBirthDate(birthDate);
  if (age == null || age > MAX_AGE) return null;

  const ptsPerGame = gamesPlayed > 0 ? points / gamesPlayed : 0;

  const abbrev =
    summaryRow.currentTeamAbbrev != null
      ? String(summaryRow.currentTeamAbbrev)
      : bioRow.currentTeamAbbrev != null
        ? String(bioRow.currentTeamAbbrev)
        : "";
  const headshotUrl = `https://assets.nhle.com/mugs/nhl/20252026/${playerId}.png`;

  const playerName =
    typeof summaryRow.skaterFullName === "string"
      ? summaryRow.skaterFullName.trim()
      : typeof bioRow.skaterFullName === "string"
        ? bioRow.skaterFullName.trim()
        : "—";

  const team = abbrev || "—";

  const seasonsInNhl = Number(bioRow.seasonsPlayed ?? summaryRow.seasonsPlayed);
  const nhlSeasons = Number.isFinite(seasonsInNhl) ? seasonsInNhl : null;

  return {
    playerId,
    playerName,
    team,
    age,
    ptsPerGame: Math.round(ptsPerGame * 1000) / 1000,
    goals: Number.isFinite(goals) ? goals : 0,
    assists: Number.isFinite(assists) ? assists : 0,
    points,
    gamesPlayed,
    nhlSeasons,
    headshotUrl,
  };
}

/**
 * @param {Array<{ rank?: number; playerId: number; playerName: string; team: string; age: number; investmentScore: number; ptsPerGame: number; goals: number; assists: number; points: number; gamesPlayed: number }>} scoredTop8
 */
function formatTop8ForClaude(scoredTop8) {
  return scoredTop8
    .map((c) => {
      const rank = c.rank ?? 0;
      return `#${rank} ${c.playerName} (playerId: ${c.playerId}, ${c.team}) — Card Scout Score ${c.investmentScore}/10 — ${c.age} ans — ${c.ptsPerGame} pts/match — ${c.goals}B ${c.assists}P ${c.points}pts — ${c.gamesPlayed} MJ`;
    })
    .join("\n");
}

/**
 * @param {number | null | undefined} score
 */
function defaultVerdictFromScore(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "À surveiller";
  if (s >= 7.5) return "Acheter maintenant";
  if (s >= 6) return "Fort potentiel";
  return "À surveiller";
}

/**
 * @param {Array<{ rank?: number; playerId: number; playerName: string; team: string; age: number; investmentScore?: number; ptsPerGame: number; goals: number; points: number; headshotUrl: string }>} scoredTop8
 */
function buildMockTopPayload(scoredTop8) {
  const now = new Date().toISOString();
  const opportunities = scoredTop8.map((c, i) => ({
    rank: c.rank ?? i + 1,
    playerId: c.playerId,
    playerName: c.playerName,
    team: c.team,
    age: c.age,
    investmentScore:
      Math.round(Math.min(10, Math.max(0, Number(c.investmentScore) || 0)) * 10) /
      10,
    verdict: defaultVerdictFromScore(c.investmentScore),
    headline: `Profil ${c.ptsPerGame} pts/match — fenêtre d'appréciation intéressante`,
    reasoning: `${c.playerName} combine jeunesse (${c.age} ans) et production stable (${c.points} points). Les cartes flagship restent liquides pour un horizon 2-3 saisons.`,
    cardRecommendations: [
      {
        cardType: "Young Guns Rookie",
        priority: "Haute",
        expectedUpside: "+40-70%",
        timeline: "2-3 saisons",
        searchQuery: `${c.playerName.split(" ").pop()?.toLowerCase() ?? "player"} young guns`,
      },
    ],
    risks: "Blessure ou ralentissement offensif peut compresser la demande à court terme.",
    ptsPerGame: c.ptsPerGame,
    goals: c.goals,
    points: c.points,
    headshotUrl: c.headshotUrl,
  }));

  return {
    lastUpdated: now,
    analysisNote:
      "Top 8 sélectionnés par Card Scout Score (7 facteurs + eBay) — activez ANTHROPIC_API_KEY pour les textes Claude.",
    opportunities,
    mocked: true,
  };
}

/**
 * Fusionne le contenu narratif Claude avec le top 8 déjà scoré et classé.
 * @param {object} claudeRaw
 * @param {Array<{ rank?: number; playerId: number; playerName: string; team: string; age: number; investmentScore: number; ptsPerGame: number; goals: number; points: number; headshotUrl: string }>} scoredTop8
 */
function mergeNarrativeWithScoredTop8(claudeRaw, scoredTop8) {
  /** @type {Map<number, object>} */
  const narrativeById = new Map();
  for (const o of Array.isArray(claudeRaw?.opportunities)
    ? claudeRaw.opportunities
    : []) {
    const id = Number(o?.playerId);
    if (Number.isFinite(id)) narrativeById.set(id, o);
  }

  const opportunities = scoredTop8.map((c, i) => {
    const narrative = narrativeById.get(c.playerId) ?? {};
    const recs = Array.isArray(narrative.cardRecommendations)
      ? narrative.cardRecommendations
      : [];

    return {
      rank: i + 1,
      playerId: c.playerId,
      playerName: c.playerName,
      team: c.team,
      age: c.age,
      investmentScore:
        Math.round(Math.min(10, Math.max(0, Number(c.investmentScore) || 0)) * 10) /
        10,
      verdict: String(
        narrative.verdict ?? defaultVerdictFromScore(c.investmentScore)
      ).trim(),
      headline: String(
        narrative.headline ??
          `Profil ${c.ptsPerGame} pts/match — opportunité Card Scout`
      ).trim(),
      reasoning: String(
        narrative.reasoning ??
          `${c.playerName} figure dans le top 8 Card Scout Score pour la saison 2024-25.`
      ).trim(),
      cardRecommendations: recs.slice(0, 4).map((r) => ({
        cardType: String(r?.cardType ?? "Carte rookie").trim(),
        priority: String(r?.priority ?? "Moyenne").trim(),
        expectedUpside: String(r?.expectedUpside ?? "—").trim(),
        timeline: String(r?.timeline ?? "2-3 saisons").trim(),
        searchQuery: String(r?.searchQuery ?? c.playerName ?? "").trim(),
      })),
      risks: String(
        narrative.risks ??
          "Volatilité du marché et risque de baisse de production."
      ).trim(),
      ptsPerGame: c.ptsPerGame,
      goals: c.goals,
      points: c.points,
      headshotUrl: c.headshotUrl,
    };
  });

  return {
    lastUpdated:
      typeof claudeRaw?.lastUpdated === "string" && claudeRaw.lastUpdated
        ? claudeRaw.lastUpdated
        : new Date().toISOString(),
    analysisNote: String(
      claudeRaw?.analysisNote ??
        "Top 8 sélectionnés et classés par Card Scout Score (7 facteurs + eBay)."
    ).trim(),
    opportunities,
    mocked: false,
  };
}

/**
 * @param {Array<Record<string, unknown>>} scoredTop8
 */
async function analyzeTop8NarrativeWithClaude(scoredTop8) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return buildMockTopPayload(scoredTop8);
  }

  const userPrompt = `Voici les 8 meilleures opportunités d'investissement cartes NHL, DÉJÀ classées par Card Scout Score (ne change pas l'ordre ni la sélection) :

${formatTop8ForClaude(scoredTop8)}

Retourne exactement ce JSON avec un objet par joueur (playerId obligatoire pour correspondance) :
{
  "lastUpdated": (date ISO),
  "analysisNote": (1 phrase : sélection basée sur Card Scout Score 7 facteurs + eBay),
  "opportunities": [
    {
      "playerId": (NHL player ID exact, identique à la liste),
      "verdict": "Acheter maintenant" | "Fort potentiel" | "À surveiller",
      "headline": (1 phrase percutante),
      "reasoning": (2-3 phrases d'analyse spécifique),
      "cardRecommendations": [
        {
          "cardType": (ex: "Young Guns Rookie 2023-24"),
          "priority": "Haute" | "Moyenne",
          "expectedUpside": (ex: "+50-80%"),
          "timeline": (ex: "2-3 saisons"),
          "searchQuery": (ex: "caufield young guns")
        }
      ],
      "risks": (1 phrase sur les risques)
    }
  ]
}`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 6000,
      temperature: 0.25,
      system: CLAUDE_NARRATIVE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
    cache: "no-store",
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${rawText.slice(0, 200)}`);
  }

  const parsed = JSON.parse(rawText);
  const textBlock = parsed?.content?.find((b) => b?.type === "text");
  const obj = extractJsonObject(textBlock?.text ?? "");
  if (!obj) {
    return buildMockTopPayload(scoredTop8);
  }

  const payload = mergeNarrativeWithScoredTop8(obj, scoredTop8);
  payload.mocked = false;
  return payload;
}

const TOP_SCORE_CONCURRENCY = 5;

/**
 * @param {Record<string, unknown>} candidate
 */
async function scoreCandidateWithCardScout(candidate) {
  const id = Number(candidate.playerId);
  const name = String(candidate.playerName ?? "").trim();
  if (!Number.isFinite(id) || !name) {
    return { ...candidate, investmentScore: null };
  }

  const landing = await getPlayerLandingCached(String(id));
  if (!landing) {
    return { ...candidate, investmentScore: null };
  }

  const scorePayload = buildScorePayloadFromLanding(String(id), landing);
  const { medianPriceCad, listingCount } =
    await getEbayMedianAndCountForPlayer(name);

  if (process.env.ANTHROPIC_API_KEY) {
    const scored = await scoreCardScoutWithClaude(
      scorePayload,
      medianPriceCad,
      listingCount
    );
    if (scored.ok && scored.score != null) {
      return { ...candidate, investmentScore: scored.score };
    }
  }

  const { weightedScore } = computeFactorScores(
    scorePayload,
    medianPriceCad,
    listingCount
  );
  return {
    ...candidate,
    investmentScore: Math.round(Math.min(10, Math.max(0, weightedScore)) * 10) / 10,
  };
}

/**
 * Card Scout Score (7 facteurs + eBay) pour tous les candidats, par batch de 5.
 * @param {Array<Record<string, unknown>>} candidates
 */
async function scoreAllCandidatesWithCardScout(candidates) {
  const results = [];
  for (let i = 0; i < candidates.length; i += TOP_SCORE_CONCURRENCY) {
    const chunk = candidates.slice(i, i + TOP_SCORE_CONCURRENCY);
    const scored = await Promise.all(
      chunk.map((c) => scoreCandidateWithCardScout(c))
    );
    results.push(...scored);
  }
  return results;
}

/**
 * Top 8 par investmentScore décroissant, rank 1..8.
 * @param {Array<{ investmentScore?: number | null } & Record<string, unknown>>} scoredCandidates
 */
function selectTop8ByInvestmentScore(scoredCandidates) {
  return scoredCandidates
    .filter((c) => Number.isFinite(Number(c.investmentScore)))
    .sort((a, b) => Number(b.investmentScore) - Number(a.investmentScore))
    .slice(0, TOP_OPPORTUNITIES_RETURN)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

/**
 * @returns {Promise<{ opportunities: object[]; lastUpdated: string; analysisNote: string; mocked?: boolean; candidateCount?: number }>}
 */
async function buildTopOpportunitesFresh() {
  const [summaryRows, biosRows] = await Promise.all([
    fetchAllSummaryForSeason(CURRENT_SEASON_ID),
    fetchAllBiosForSeason(CURRENT_SEASON_ID),
  ]);

  /** @type {Map<number, Record<string, unknown>>} */
  const biosById = new Map();
  for (const row of biosRows) {
    const id = Number(row.playerId);
    if (Number.isFinite(id)) biosById.set(id, row);
  }

  await enrichBirthDatesFromLanding(biosById, summaryRows);

  const candidates = [];
  for (const summaryRow of summaryRows) {
    const id = Number(summaryRow.playerId);
    if (!Number.isFinite(id)) continue;
    const bioRow = biosById.get(id) ?? {};
    const c = buildCandidate(summaryRow, bioRow);
    if (c) candidates.push(c);
  }

  if (candidates.length === 0) {
    throw new Error("Aucun candidat NHL après filtrage");
  }

  candidates.sort((a, b) => b.ptsPerGame - a.ptsPerGame);
  const scoringPool = candidates.slice(0, TOP_SCORING_POOL);

  const scoredCandidates = await scoreAllCandidatesWithCardScout(scoringPool);
  const top8 = selectTop8ByInvestmentScore(scoredCandidates);
  if (top8.length === 0) {
    throw new Error("Aucun candidat avec Card Scout Score valide");
  }

  const payload = await analyzeTop8NarrativeWithClaude(top8);
  return { ...payload, candidateCount: scoringPool.length };
}

/**
 * @returns {boolean}
 */
export function isTopOpportunitesStale() {
  if (!topOpportunitiesCache.payload) return true;
  return !isCacheEntryFresh(topOpportunitiesCache.fetchedAt);
}

/**
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<{ ok: true; opportunities: object[]; lastUpdated: string; analysisNote: string; mocked?: boolean; candidateCount?: number } | { ok: false; error: string }>}
 */
export async function getTopOpportunites(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh) {
    const blobEntry = await readOpportunitesCacheFromBlob();
    if (blobEntry) {
      setMemoryCache(blobEntry);
      return { ok: true, ...blobEntry.payload };
    }

    if (
      topOpportunitiesCache.payload &&
      isCacheEntryFresh(topOpportunitiesCache.fetchedAt)
    ) {
      return { ok: true, ...topOpportunitiesCache.payload };
    }
  }

  try {
    const fresh = await buildTopOpportunitesFresh();
    const entry = { fetchedAt: Date.now(), payload: fresh };
    setMemoryCache(entry);
    await writeOpportunitesCacheToBlob(entry);
    return { ok: true, ...fresh };
  } catch (err) {
    if (topOpportunitiesCache.payload) {
      return {
        ok: true,
        ...topOpportunitiesCache.payload,
        stale: true,
        error: String(err?.message ?? err),
      };
    }

    if (!forceRefresh) {
      try {
        const result = await get(BLOB_CACHE_PATHNAME, { access: "private" });
        if (result.stream) {
          const text = await new Response(result.stream).text();
          const parsed = JSON.parse(text);
          if (parsed?.payload) {
            return {
              ok: true,
              ...parsed.payload,
              stale: true,
              error: String(err?.message ?? err),
            };
          }
        }
      } catch {
        /* ignore */
      }
    }

    return {
      ok: false,
      error: String(err?.message ?? err) || "Analyse top opportunités impossible",
    };
  }
}
