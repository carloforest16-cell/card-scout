import "server-only";

import {
  buildScorePayloadFromLanding,
  computeFactorScores,
  scoreCardScoutWithClaude,
} from "@/lib/cardScoutScore";
import { getEbayMedianAndCountForPlayer } from "@/lib/dealFinder";
import { getDeepseekApiKey } from "@/lib/deepseekKey";
import { runInBackground } from "@/lib/backgroundTask";
import { getSportConfig } from "@/lib/sportConfig";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchPlayerLanding } from "./nhlPlayerLanding";
import { getPlayerLandingCached } from "./nhlPlayerLandingCached";

export const CURRENT_SEASON_ID = 20252026;
const PREV_SEASON_ID = 20242025;
const PAGE_LIMIT = 100;

// Seuils par défaut NHL — viennent du sportConfig pour réplication multi-sport.
// On garde des constantes locales pour ne pas casser les callers existants ;
// les seuils sont identiques à getSportConfig('NHL').candidateFilters.
const NHL_CONFIG = getSportConfig("NHL");
const MIN_GAMES_PLAYED = NHL_CONFIG.candidateFilters.minGamesPlayed;
const MAX_AGE = NHL_CONFIG.candidateFilters.maxAge;
const TOP_OPPORTUNITIES_RETURN = 10;
const TOP_SCORING_POOL = 75;

export const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SUPABASE_CACHE_KEY = "top-10";

const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const CLAUDE_NARRATIVE_SYSTEM_PROMPT = `Tu es le meilleur expert mondial en investissement de cartes NHL.

Les 8 joueurs suivants ont DÃ‰JÃ€ Ã©tÃ© sÃ©lectionnÃ©s et classÃ©s par le Card Metrics Score (7 facteurs mathÃ©matiques + marchÃ© eBay). Tu ne choisis PAS qui figure dans la liste et tu ne modifies PAS les scores.

Pour CHACUN des 8 joueurs (dans l'ordre donnÃ©), rÃ©dige uniquement :
- verdict : "Acheter maintenant" | "Fort potentiel" | "Ã€ surveiller"
- headline : 1 phrase percutante (ex: "Le prochain grand de MontrÃ©al")
- reasoning : 2-3 phrases d'analyse spÃ©cifique au joueur et aux cartes
- cardRecommendations : 1 ÃƒÂ  3 cartes concrÃ¨tes ÃƒÂ  cibler (Young Guns, autos, etc.)
- risks : 1 phrase sur les risques (blessure, trade, baisse de forme)

ConsidÃ¨re : trajectoire, rÃ´le franchise vs role player, marchÃ© canadien, liquiditÃ© eBay, fenÃªtre d'apprÃ©ciation 1-3 saisons.

RÃ©ponds UNIQUEMENT en JSON valide, aucun texte avant ou aprÃ¨s.`;

/** @type {{ fetchedAt: number; payload: object | null }} */
let topOpportunitiesCache = { fetchedAt: 0, payload: null };

/**
 * @param {number} fetchedAt
 */
function isCacheEntryFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CACHE_TTL_MS;
}

/**
 * @returns {Promise<{ fetchedAt: number; payload: object } | null>}
 */
async function readOpportunitesCacheFromSupabase() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("cache_opportunites")
      .select("fetched_at, payload")
      .eq("key", SUPABASE_CACHE_KEY)
      .maybeSingle();
    if (error || !data?.payload) return null;
    const fetchedAt = new Date(data.fetched_at).getTime();
    if (!isCacheEntryFresh(fetchedAt)) return null;
    return { fetchedAt, payload: data.payload };
  } catch (err) {
    console.error("[opportunitesTop] readOpportunitesCacheFromSupabase failed:", err?.message ?? err);
    return null;
  }
}

async function readStaleOpportunitesCache() {
  if (topOpportunitiesCache.payload) return topOpportunitiesCache;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("cache_opportunites")
      .select("fetched_at, payload")
      .eq("key", SUPABASE_CACHE_KEY)
      .maybeSingle();
    if (error || !data?.payload) return null;
    const fetchedAt = new Date(data.fetched_at).getTime();
    const entry = { fetchedAt, payload: data.payload };
    setMemoryCache(entry);
    return entry;
  } catch (err) {
    console.error("[opportunitesTop] readStaleOpportunitesCache failed:", err?.message ?? err);
    return null;
  }
}

/**
 * @param {{ fetchedAt: number; payload: object }} entry
 */
async function writeOpportunitesCacheToSupabase(entry) {
  const supabase = getSupabaseAdmin();
  await supabase.from("cache_opportunites").upsert({
    key: SUPABASE_CACHE_KEY,
    fetched_at: new Date(entry.fetchedAt).toISOString(),
    payload: entry.payload,
  }, { onConflict: "key" });
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
 * Stats NHL : seasonId/gameTypeId en query renvoie 500  -  filtre via cayenneExp.
 * @param {number} seasonId
 * @param {number} start
 * @returns {string}
 */
function buildSkaterSummaryUrl(seasonId, start) {
  const cayenne = `seasonId=${seasonId} and gameTypeId=2`;
  return `https://api.nhle.com/stats/rest/en/skater/summary?limit=100&start=${start}&sort=points&dir=DESC&isAggregate=false&isGame=false&cayenneExp=${encodeURIComponent(cayenne)}`;
}

/**
 * URL bios demandÃ©e (query seasonId)  -  souvent 500 cÃ´tÃ© NHL.
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
      "User-Agent": "CardMetrics/1.0 (opportunites-top)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
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
export async function fetchAllSummaryForSeason(seasonId) {
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
export async function fetchAllBiosForSeason(seasonId) {
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
 * ComplÃ¨te birthDate via l'API landing quand bios/summary n'en ont pas.
 * @param {Map<number, Record<string, unknown>>} biosById
 * @param {Array<Record<string, unknown>>} summaryRows
 */
export async function enrichBirthDatesFromLanding(biosById, summaryRows) {
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
  const headshotUrl = abbrev
    ? `https://assets.nhle.com/mugs/nhl/20252026/${abbrev}/${playerId}.png`
    : `https://assets.nhle.com/mugs/nhl/20252026/${playerId}.png`;

  const playerName =
    typeof summaryRow.skaterFullName === "string"
      ? summaryRow.skaterFullName.trim()
      : typeof bioRow.skaterFullName === "string"
        ? bioRow.skaterFullName.trim()
        : " - ";

  const team = abbrev || " - ";

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
      return `#${rank} ${c.playerName} (playerId: ${c.playerId}, ${c.team})  -  Card Metrics Score ${c.investmentScore}/10  -  ${c.age} ans  -  ${c.ptsPerGame} pts/match  -  ${c.goals}B ${c.assists}P ${c.points}pts  -  ${c.gamesPlayed} MJ`;
    })
    .join("\n");
}

/**
 * @param {number | null | undefined} score
 */
function defaultVerdictFromScore(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "Ã€ surveiller";
  if (s >= 7.5) return "Acheter maintenant";
  if (s >= 6) return "Fort potentiel";
  return "Ã€ surveiller";
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
    headline: `Profil ${c.ptsPerGame} pts/match  -  fenÃªtre d'apprÃ©ciation intÃ©ressante`,
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
    risks: "Blessure ou ralentissement offensif peut compresser la demande ÃƒÂ  court terme.",
    ptsPerGame: c.ptsPerGame,
    goals: c.goals,
    points: c.points,
    headshotUrl: c.headshotUrl,
  }));

  return {
    lastUpdated: now,
    analysisNote:
      "Top 8 sÃ©lectionnÃ©s par Card Metrics Score (7 facteurs + eBay)  -  activez CS_CLAUDE_KEY pour les textes Claude.",
    opportunities,
    mocked: true,
  };
}

/**
 * Fusionne le contenu narratif Claude avec le top 8 dÃ©jÃƒÂ  scorÃ© et classÃ©.
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
          `Profil ${c.ptsPerGame} pts/match  -  opportunitÃ© Card Metrics`
      ).trim(),
      reasoning: String(
        narrative.reasoning ??
          `${c.playerName} figure dans le top 10 Card Metrics Score pour la saison 2024-25.`
      ).trim(),
      cardRecommendations: recs.slice(0, 4).map((r) => ({
        cardType: String(r?.cardType ?? "Carte rookie").trim(),
        priority: String(r?.priority ?? "Moyenne").trim(),
        expectedUpside: String(r?.expectedUpside ?? " - ").trim(),
        timeline: String(r?.timeline ?? "2-3 saisons").trim(),
        searchQuery: String(r?.searchQuery ?? c.playerName ?? "").trim(),
      })),
      risks: String(
        narrative.risks ??
          "VolatilitÃ© du marchÃ© et risque de baisse de production."
      ).trim(),
      ptsPerGame: c.ptsPerGame,
      goals: c.goals,
      points: c.points,
      headshotUrl: c.headshotUrl,
    };
  });

  return {
    // Toujours l'heure serveur réelle — DeepSeek n'a pas de notion fiable de
    // la date courante et peut halluciner une valeur (vu en prod : un
    // "lastUpdated" figé à une date passée alors que le cache était frais).
    lastUpdated: new Date().toISOString(),
    analysisNote: String(
      claudeRaw?.analysisNote ??
        "Top 10 sÃ©lectionnÃ©s et classÃ©s par Card Metrics Score (7 facteurs + eBay)."
    ).trim(),
    opportunities,
    mocked: false,
  };
}

/**
 * @param {Array<Record<string, unknown>>} scoredTop8
 */
async function analyzeTop8NarrativeWithClaude(scoredTop8) {
  const apiKey = getDeepseekApiKey();
  if (!apiKey) {
    return buildMockTopPayload(scoredTop8);
  }

  const userPrompt = `Voici les 10 meilleures opportunitÃ©s d'investissement cartes NHL, DÃ‰JÃ€ classÃ©es par Card Metrics Score (ne change pas l'ordre ni la sÃ©lection) :

${formatTop8ForClaude(scoredTop8)}

Retourne exactement ce JSON avec un objet par joueur (playerId obligatoire pour correspondance) :
{
  "lastUpdated": (date ISO),
  "analysisNote": (1 phrase : sÃ©lection basÃ©e sur Card Metrics Score 7 facteurs + eBay),
  "opportunities": [
    {
      "playerId": (NHL player ID exact, identique ÃƒÂ  la liste),
      "verdict": "Acheter maintenant" | "Fort potentiel" | "Ã€ surveiller",
      "headline": (1 phrase percutante),
      "reasoning": (2-3 phrases d'analyse spÃ©cifique),
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

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      max_tokens: 6000,
      temperature: 0.25,
      messages: [
        { role: "system", content: CLAUDE_NARRATIVE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`DeepSeek ${res.status}: ${rawText.slice(0, 200)}`);
  }

  const parsed = JSON.parse(rawText);
  const text = parsed?.choices?.[0]?.message?.content ?? "";
  const obj = extractJsonObject(text);
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
async function scoreCandidateWithCardMetrics(candidate) {
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

  // Pool de ~75 candidats : score mathÃ©matique seulement (pas d'eBay ni Claude
  // par joueur â€” sinon 75Ã—2 appels externes = 60-120 s). Le classement final
  // et l'ajustement Claude Â±0.5 sont appliquÃ©s sur le top 8 uniquement.
  const { weightedScore } = computeFactorScores(scorePayload, null, null, null);
  return {
    ...candidate,
    investmentScore:
      Math.round(Math.min(10, Math.max(0, weightedScore)) * 10) / 10,
  };
}

/**
 * Enrichit le top 8 avec le score Claude (+ eBay) â€” 8 appels max au lieu de 75.
 * @param {Array<Record<string, unknown>>} top8
 */
async function enrichTop8WithClaudeScores(top8) {
  if (!getDeepseekApiKey()) return top8;

  const enriched = await Promise.all(
    top8.map(async (c) => {
      const id = String(c.playerId ?? "");
      const name = String(c.playerName ?? "").trim();
      if (!id || !name) return c;

      const landing = await getPlayerLandingCached(id);
      if (!landing) return c;

      const scorePayload = buildScorePayloadFromLanding(id, landing);
      const { medianPriceCad, listingCount } =
        await getEbayMedianAndCountForPlayer(name);
      const scored = await scoreCardScoutWithClaude(
        scorePayload,
        medianPriceCad,
        listingCount
      );
      if (scored.ok && scored.score != null) {
        return { ...c, investmentScore: scored.score };
      }
      return c;
    })
  );

  return enriched
    .sort((a, b) => Number(b.investmentScore) - Number(a.investmentScore))
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

/**
 * Card Metrics Score (7 facteurs + eBay) pour tous les candidats, par batch de 5.
 * @param {Array<Record<string, unknown>>} candidates
 */
async function scoreAllCandidatesWithCardMetrics(candidates) {
  const results = [];
  for (let i = 0; i < candidates.length; i += TOP_SCORE_CONCURRENCY) {
    const chunk = candidates.slice(i, i + TOP_SCORE_CONCURRENCY);
    const scored = await Promise.all(
      chunk.map((c) => scoreCandidateWithCardMetrics(c))
    );
    results.push(...scored);
  }
  return results;
}

/**
 * Top 8 par investmentScore dÃ©croissant, rank 1..8.
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
 * Construit le top 8 Ã  partir des scores centralisÃ©s en DB (source unique de
 * vÃ©ritÃ©, mÃªmes scores que les pages joueur). Ne fait PAS le batch NHL+scoring :
 * lit les 8 meilleurs scores, rÃ©hydrate age/buts/pts/match via le landing (8
 * appels, cachÃ©s), puis gÃ©nÃ¨re la narration Claude. Retourne null si la table
 * n'a pas assez de lignes (cron jamais passÃ©) â†’ on retombe sur le batch complet.
 * @returns {Promise<object | null>}
 */
async function buildTopOpportunitesFromDb() {
  let rows;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("player_scores")
      .select("player_id, player_name, team, headshot_url, score, points")
      .order("score", { ascending: false })
      .limit(TOP_OPPORTUNITIES_RETURN);
    if (error) {
      console.error("[opportunitesTop] buildTopOpportunitesFromDb query failed:", error.message ?? error);
      return null;
    }
    rows = data;
  } catch (err) {
    console.error("[opportunitesTop] buildTopOpportunitesFromDb failed:", err?.message ?? err);
    return null;
  }
  if (!Array.isArray(rows) || rows.length < TOP_OPPORTUNITIES_RETURN) return null;

  const scoredTop8 = await Promise.all(
    rows.map(async (row, i) => {
      const id = String(row.player_id);
      const landing = await getPlayerLandingCached(id).catch(() => null);
      const payload = landing ? buildScorePayloadFromLanding(id, landing) : null;
      const cs = payload?.currentSeason ?? {};
      const headshotUrl =
        landing?.headshot ??
        row.headshot_url ??
        `https://assets.nhle.com/mugs/nhl/${CURRENT_SEASON_ID}/${id}.png`;
      return {
        rank: i + 1,
        playerId: Number(id),
        playerName: row.player_name ?? payload?.playerName ?? "â€”",
        team: row.team ?? payload?.teamAbbrev ?? "â€”",
        age: payload?.ageYears ?? null,
        investmentScore:
          Math.round(Math.min(10, Math.max(0, Number(row.score) || 0)) * 10) / 10,
        ptsPerGame: Number(cs.pointsPerGame) || 0,
        goals: Number(cs.goals) || 0,
        assists: Number(cs.assists) || 0,
        points: Number(cs.points ?? row.points) || 0,
        gamesPlayed: Number(cs.gamesPlayed) || 0,
        headshotUrl,
      };
    })
  );

  const payload = await analyzeTop8NarrativeWithClaude(scoredTop8);
  return { ...payload, candidateCount: TOP_SCORING_POOL, source: "db" };
}

/**
 * @returns {Promise<{ opportunities: object[]; lastUpdated: string; analysisNote: string; mocked?: boolean; candidateCount?: number }>}
 */
async function buildTopOpportunitesFresh() {
  // Chemin nominal : scores centralisÃ©s Supabase (cohÃ©rents avec les pages joueur).
  const fromDb = await buildTopOpportunitesFromDb();
  if (fromDb) return fromDb;

  // Fallback (table vide / DB indisponible) : ancien batch NHL + scoring live.
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
    throw new Error("Aucun candidat NHL aprÃ¨s filtrage");
  }

  candidates.sort((a, b) => b.ptsPerGame - a.ptsPerGame);
  const scoringPool = candidates.slice(0, TOP_SCORING_POOL);

  const scoredCandidates = await scoreAllCandidatesWithCardMetrics(scoringPool);
  let top8 = selectTop8ByInvestmentScore(scoredCandidates);
  if (top8.length === 0) {
    throw new Error("Aucun candidat avec Card Metrics Score valide");
  }

  top8 = await enrichTop8WithClaudeScores(top8);
  const payload = await analyzeTop8NarrativeWithClaude(top8);
  return { ...payload, candidateCount: scoringPool.length };
}

/**
 * Lecture pure du cache opportunités (mémoire puis Supabase) — jamais de
 * rebuild. Pour la sentinelle de fraîcheur (/api/health).
 * @returns {Promise<{ fetchedAt: number } | null>}
 */
export async function readOpportunitesCacheOnly() {
  if (topOpportunitiesCache.payload) return { fetchedAt: topOpportunitiesCache.fetchedAt };
  const entry = await readOpportunitesCacheFromSupabase();
  if (entry) return { fetchedAt: entry.fetchedAt };
  const stale = await readStaleOpportunitesCache();
  return stale ? { fetchedAt: stale.fetchedAt } : null;
}

/**
 * @returns {boolean}
 */
export function isTopOpportunitesStale() {
  if (!topOpportunitiesCache.payload) return true;
  return !isCacheEntryFresh(topOpportunitiesCache.fetchedAt);
}

/**
 * @param {{ forceRefresh?: boolean; sport?: string }} [options]
 * @returns {Promise<{ ok: true; opportunities: object[]; lastUpdated: string; analysisNote: string; mocked?: boolean; candidateCount?: number } | { ok: false; error: string }>}
 */
export async function getTopOpportunites(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  // PR 14 : param `sport` accepté. Pour l'instant, seul 'NHL' est supporté.
  // Les futures implémentations multi-sport branchent ici.
  const sport = String(options.sport ?? "NHL").toUpperCase();
  if (sport !== "NHL") {
    return {
      ok: false,
      error: `Sport '${sport}' pas encore implémenté — utilise 'NHL'.`,
    };
  }

  if (!forceRefresh) {
    const blobEntry = await readOpportunitesCacheFromSupabase();
    if (blobEntry) {
      setMemoryCache(blobEntry);
      return { ok: true, ...blobEntry.payload, fetchedAt: blobEntry.fetchedAt };
    }

    if (
      topOpportunitiesCache.payload &&
      isCacheEntryFresh(topOpportunitiesCache.fetchedAt)
    ) {
      return { ok: true, ...topOpportunitiesCache.payload, fetchedAt: topOpportunitiesCache.fetchedAt };
    }

    const stale = await readStaleOpportunitesCache();
    if (stale?.payload) {
      runInBackground(() => getTopOpportunites({ forceRefresh: true }));
      return { ok: true, ...stale.payload, stale: true, fetchedAt: stale.fetchedAt };
    }
  }

  try {
    const fresh = await buildTopOpportunitesFresh();
    const entry = { fetchedAt: Date.now(), payload: fresh };
    setMemoryCache(entry);
    await writeOpportunitesCacheToSupabase(entry);
    return { ok: true, ...fresh, fetchedAt: entry.fetchedAt };
  } catch (err) {
    // Bug de prod de juin (2 semaines de badge fige "8 avril 2025" sans que
    // personne ne s'en aperçoive) : le payload marquait deja stale/error,
    // mais rien ne loggait cote serveur — invisible dans les logs Vercel.
    console.error("[opportunitesTop] getTopOpportunites: build frais echoue, fallback sur cache perime:", err?.message ?? err);

    if (topOpportunitiesCache.payload) {
      return {
        ok: true,
        ...topOpportunitiesCache.payload,
        stale: true,
        error: String(err?.message ?? err),
      };
    }

    if (!forceRefresh) {
      const stale = await readStaleOpportunitesCache();
      if (stale?.payload) {
        return {
          ok: true,
          ...stale.payload,
          stale: true,
          error: String(err?.message ?? err),
        };
      }
    }

    return {
      ok: false,
      error: String(err?.message ?? err) || "Analyse top opportunitÃ©s impossible",
    };
  }
}

