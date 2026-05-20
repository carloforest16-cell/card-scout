import "server-only";

import { fetchPlayerLanding } from "./nhlPlayerLanding";

const CURRENT_SEASON_ID = 20242025;
const PREV_SEASON_ID = 20232024;
const PAGE_LIMIT = 100;
const MIN_GAMES_PLAYED = 25;
const MAX_AGE = 30;
const TOP_CANDIDATES = 25;
const TOP_OPPORTUNITIES_RETURN = 8;

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const CLAUDE_SYSTEM_PROMPT = `Tu es le meilleur expert mondial en investissement de cartes NHL. Tu as analysé des milliers de collections et prédit avec précision quels joueurs allaient exploser en valeur.

Ta mission : parmi cette liste de joueurs NHL prometteurs, identifier les 8 MEILLEURES opportunités d'investissement en cartes pour les prochaines 1-3 saisons.

Considère pour chaque joueur :
- Âge et fenêtre de progression
- Trajectoire de carrière et plafond potentiel
- Rôle dans son équipe (franchise player vs role player)
- Popularité et marché (joueurs canadiens = bonus)
- Type de cartes disponibles (Young Guns rookies = or)
- Risques (blessures, trade, baisse de forme)
- Comparaison avec des joueurs similaires dans l'histoire

Réponds UNIQUEMENT en JSON valide, aucun texte avant ou après.`;

/** @type {{ fetchedAt: number; payload: object | null }} */
let topOpportunitiesCache = { fetchedAt: 0, payload: null };

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
  const biosUrl = `https://api.nhle.com/stats/rest/en/skater/bios?limit=100&start=${start}&seasonId=20242025&gameTypeId=2`;
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
 * @param {number} currPts
 * @param {{ points: number; gamesPlayed: number } | undefined} prev
 * @returns {number} 0–1
 */
function progressionBonus(currPts, prev) {
  if (!prev || prev.gamesPlayed < 5) return 0.85;
  const prevPts = prev.points;
  if (!Number.isFinite(prevPts) || prevPts <= 0) {
    return currPts >= 15 ? 0.95 : 0.75;
  }
  const delta = (currPts - prevPts) / prevPts;
  if (delta >= 0.25) return 1;
  if (delta >= 0.1) return 0.7 + (delta - 0.1) * 2;
  if (delta >= -0.08) return 0.45 + (delta + 0.08) * 1.5;
  return 0.2;
}

/**
 * @param {Record<string, unknown>} summaryRow
 * @param {Record<string, unknown>} bioRow
 * @param {Map<number, { points: number; gamesPlayed: number }>} prevById
 */
function buildCandidate(summaryRow, bioRow, prevById) {
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
  const prog = progressionBonus(points, prevById.get(playerId));

  const underdogScore =
    (ptsPerGame / 1.2) * 40 +
    (Math.max(0, MAX_AGE - age) / 12) * 25 +
    (gamesPlayed / 82) * 15 +
    prog * 20;

  const abbrev =
    summaryRow.currentTeamAbbrev != null
      ? String(summaryRow.currentTeamAbbrev)
      : bioRow.currentTeamAbbrev != null
        ? String(bioRow.currentTeamAbbrev)
        : "";
  const seasonStr = String(CURRENT_SEASON_ID);
  const headshotUrl = abbrev
    ? `https://assets.nhle.com/mugs/nhl/${seasonStr}/${abbrev}/${playerId}.png`
    : `https://assets.nhle.com/mugs/nhl/${seasonStr}/${playerId}.png`;

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
    underdogScore: Math.round(underdogScore * 100) / 100,
    headshotUrl,
  };
}

/**
 * @param {Array<Record<string, unknown>>} candidates
 */
function formatCandidatesForClaude(candidates) {
  return candidates
    .map((c, i) => {
      const seasons =
        c.nhlSeasons != null ? `${c.nhlSeasons} saisons NHL` : "saisons NHL n/d";
      return `${i + 1}. ${c.playerName} (${c.team}) — ${c.age} ans — ${c.ptsPerGame} pts/match — ${c.goals}B ${c.assists}P ${c.points}pts — ${c.gamesPlayed} MJ — ${seasons} — score préliminaire ${c.underdogScore}`;
    })
    .join("\n");
}

/**
 * @param {Array<Record<string, unknown>>} top25
 */
function buildMockTopPayload(top25) {
  const now = new Date().toISOString();
  const opportunities = top25.slice(0, TOP_OPPORTUNITIES_RETURN).map((c, i) => ({
    rank: i + 1,
    playerId: c.playerId,
    playerName: c.playerName,
    team: c.team,
    age: c.age,
    investmentScore: Math.min(9.5, 6.8 + (top25.length - i) * 0.12),
    verdict: i < 3 ? "Acheter maintenant" : i < 6 ? "Fort potentiel" : "À surveiller",
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
      "Sélection heuristique (démo) basée sur stats NHL 2024-25 — activez ANTHROPIC_API_KEY pour l'analyse Claude.",
    opportunities,
    mocked: true,
  };
}

/**
 * @param {object} raw
 * @param {Map<number, { headshotUrl: string; playerName: string }>} lookup
 */
function normalizeClaudePayload(raw, lookup) {
  const opportunities = Array.isArray(raw?.opportunities)
    ? raw.opportunities
    : [];

  const normalized = opportunities.slice(0, TOP_OPPORTUNITIES_RETURN).map((o, i) => {
    const id = Number(o?.playerId);
    const meta = Number.isFinite(id) ? lookup.get(id) : null;
    const recs = Array.isArray(o?.cardRecommendations)
      ? o.cardRecommendations
      : [];

    return {
      rank: Number(o?.rank) || i + 1,
      playerId: Number.isFinite(id) ? id : null,
      playerName: String(o?.playerName ?? meta?.playerName ?? "—").trim(),
      team: String(o?.team ?? "—").trim(),
      age: Number(o?.age) || null,
      investmentScore:
        Math.round(Math.min(10, Math.max(0, Number(o?.investmentScore) || 0)) * 10) /
        10,
      verdict: String(o?.verdict ?? "À surveiller").trim(),
      headline: String(o?.headline ?? "").trim(),
      reasoning: String(o?.reasoning ?? "").trim(),
      cardRecommendations: recs.slice(0, 4).map((r) => ({
        cardType: String(r?.cardType ?? "Carte rookie").trim(),
        priority: String(r?.priority ?? "Moyenne").trim(),
        expectedUpside: String(r?.expectedUpside ?? "—").trim(),
        timeline: String(r?.timeline ?? "2-3 saisons").trim(),
        searchQuery: String(r?.searchQuery ?? o?.playerName ?? "").trim(),
      })),
      risks: String(o?.risks ?? "").trim(),
      ptsPerGame: Number(o?.ptsPerGame) || null,
      goals: Number(o?.goals) ?? null,
      points: Number(o?.points) ?? null,
      headshotUrl: meta?.headshotUrl ?? null,
    };
  });

  normalized.sort((a, b) => a.rank - b.rank);

  return {
    lastUpdated:
      typeof raw?.lastUpdated === "string" && raw.lastUpdated
        ? raw.lastUpdated
        : new Date().toISOString(),
    analysisNote: String(
      raw?.analysisNote ??
        "Analyse Claude sur les 25 meilleurs profils statistiques NHL 2024-25."
    ).trim(),
    opportunities: normalized,
    mocked: false,
  };
}

/**
 * @param {Array<Record<string, unknown>>} top25
 */
async function analyzeTop25WithClaude(top25) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const lookup = new Map(
    top25.map((c) => [
      c.playerId,
      { headshotUrl: c.headshotUrl, playerName: c.playerName },
    ])
  );

  if (!apiKey) {
    return buildMockTopPayload(top25);
  }

  const userPrompt = `Voici les 25 meilleurs candidats NHL cette saison 2024-25 basés sur leurs stats :

${formatCandidatesForClaude(top25)}

Retourne exactement ce JSON :
{
  "lastUpdated": (date ISO),
  "analysisNote": (1 phrase sur ta méthodologie),
  "opportunities": [
    {
      "rank": 1,
      "playerId": (NHL player ID),
      "playerName": (nom complet),
      "team": (abréviation équipe),
      "age": (âge),
      "investmentScore": (0-10),
      "verdict": "Acheter maintenant" | "Fort potentiel" | "À surveiller",
      "headline": (1 phrase percutante ex: "Le prochain grand de Montréal"),
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
      "risks": (1 phrase sur les risques),
      "ptsPerGame": (nombre),
      "goals": (nombre),
      "points": (nombre)
    }
  ]
}`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      temperature: 0.25,
      system: CLAUDE_SYSTEM_PROMPT,
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
    return buildMockTopPayload(top25);
  }

  const payload = normalizeClaudePayload(obj, lookup);
  payload.mocked = false;
  return payload;
}

/**
 * @returns {Promise<{ opportunities: object[]; lastUpdated: string; analysisNote: string; mocked?: boolean; candidateCount?: number }>}
 */
async function buildTopOpportunitesFresh() {
  const [summaryRows, biosRows, prevSummary] = await Promise.all([
    fetchAllSummaryForSeason(CURRENT_SEASON_ID),
    fetchAllBiosForSeason(CURRENT_SEASON_ID),
    fetchAllSummaryForSeason(PREV_SEASON_ID),
  ]);

  /** @type {Map<number, Record<string, unknown>>} */
  const biosById = new Map();
  for (const row of biosRows) {
    const id = Number(row.playerId);
    if (Number.isFinite(id)) biosById.set(id, row);
  }

  await enrichBirthDatesFromLanding(biosById, summaryRows);

  /** @type {Map<number, { points: number; gamesPlayed: number }>} */
  const prevById = new Map();
  for (const row of prevSummary) {
    const id = Number(row.playerId);
    if (!Number.isFinite(id)) continue;
    prevById.set(id, {
      points: Number(row.points),
      gamesPlayed: Number(row.gamesPlayed),
    });
  }

  const candidates = [];
  for (const summaryRow of summaryRows) {
    const id = Number(summaryRow.playerId);
    if (!Number.isFinite(id)) continue;
    const bioRow = biosById.get(id) ?? {};
    const c = buildCandidate(summaryRow, bioRow, prevById);
    if (c) candidates.push(c);
  }

  candidates.sort((a, b) => b.underdogScore - a.underdogScore);
  const top25 = candidates.slice(0, TOP_CANDIDATES);

  if (top25.length === 0) {
    throw new Error("Aucun candidat NHL après filtrage");
  }

  const payload = await analyzeTop25WithClaude(top25);
  return { ...payload, candidateCount: candidates.length };
}

/**
 * @returns {boolean}
 */
export function isTopOpportunitesStale() {
  if (!topOpportunitiesCache.payload) return true;
  return Date.now() - topOpportunitiesCache.fetchedAt >= CACHE_TTL_MS;
}

/**
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<{ ok: true; opportunities: object[]; lastUpdated: string; analysisNote: string; mocked?: boolean; candidateCount?: number } | { ok: false; error: string }>}
 */
export async function getTopOpportunites(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (
    !forceRefresh &&
    topOpportunitiesCache.payload &&
    !isTopOpportunitesStale()
  ) {
    return { ok: true, ...topOpportunitiesCache.payload };
  }

  try {
    const fresh = await buildTopOpportunitesFresh();
    topOpportunitiesCache = {
      fetchedAt: Date.now(),
      payload: fresh,
    };
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
    return {
      ok: false,
      error: String(err?.message ?? err) || "Analyse top opportunités impossible",
    };
  }
}
