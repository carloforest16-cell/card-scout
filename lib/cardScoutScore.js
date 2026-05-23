import "server-only";

import { formatSeasonLabel } from "@/lib/nhlPlayerLanding";
import { verdictTone } from "@/lib/verdictTone";

/** Moyenne indicative NHL (pts/match), rappel pour le modèle */
export const NHL_LEAGUE_AVG_PPG = 0.6;

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const CANADIAN_TEAM_ABBREVS = new Set([
  "MTL",
  "TOR",
  "EDM",
  "CGY",
  "VAN",
  "OTT",
  "WPG",
]);

/** @type {Record<string, number>} */
export const FACTOR_WEIGHTS = {
  performance: 0.2,
  momentum: 0.2,
  age: 0.15,
  marketValue: 0.15,
  liquidity: 0.1,
  upside: 0.1,
  hype: 0.1,
};

const SYSTEM_PROMPT = `Tu es un expert en cartes de sport NHL et en analyse de marché.
Les 7 facteurs du Card Scout Score sont DÉJÀ calculés mathématiquement côté serveur.
Tu ne recalcules PAS ces facteurs. Tu ajustes seulement le score global de ±0.5 maximum selon le contexte qualitatif (blessures récentes, hype médiatique, rareté de cartes, etc.).

Réponds UNIQUEMENT en JSON valide avec ces champs :
{
  "scoreAdjustment": (float entre -0.5 et +0.5),
  "verdict": "Acheter" | "Surveiller" | "Éviter",
  "reasoning": (max 2 phrases, factuelle, en français)
}`;

const NHL_GAME_TYPE_REGULAR = 2;

/**
 * @param {unknown} birthDate
 * @returns {number | null}
 */
export function ageYearsFromBirthDate(birthDate) {
  if (birthDate == null || birthDate === "") return null;
  const raw = String(birthDate).trim();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 60 ? age : null;
}

/**
 * @param {Record<string, unknown>} data
 */
function resolveBirthDateString(data) {
  const direct = data.birthDate;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = data.player && typeof data.player === "object" && data.player.birthDate;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return null;
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} n
 */
function clampFactor(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(10, Math.max(0, x));
}

/**
 * Lignes saison régulière NHL, triées saison décroissante.
 * @param {unknown} seasonTotals
 * @param {number} [take]
 */
function extractNhlRegularSeasonRows(seasonTotals, take = 8) {
  if (!Array.isArray(seasonTotals)) return [];

  const filtered = seasonTotals.filter((r) => {
    if (!r || typeof r !== "object") return false;
    const league = String(r.leagueAbbrev ?? "").toUpperCase();
    return league === "NHL" && Number(r.gameTypeId) === NHL_GAME_TYPE_REGULAR;
  });

  filtered.sort((a, b) => {
    const ds = Number(b.season) - Number(a.season);
    if (ds !== 0) return ds;
    return Number(b.sequence ?? 0) - Number(a.sequence ?? 0);
  });

  return filtered.slice(0, take).map((r) => {
    const gp = toNum(r.gamesPlayed);
    const pts = toNum(r.points);
    const goals = toNum(r.goals);
    const assists = toNum(r.assists);
    let ppg = null;
    if (gp != null && gp > 0 && pts != null) ppg = Math.round((pts / gp) * 1000) / 1000;
    return {
      season: r.season != null ? String(r.season) : null,
      seasonLabel: formatSeasonLabel(r.season),
      teamAbbrev: r.teamAbbrev != null ? String(r.teamAbbrev) : null,
      gamesPlayed: gp,
      goals,
      assists,
      points: pts,
      pointsPerGame: ppg,
    };
  });
}

function namePart(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && v.default != null) return String(v.default).trim();
  return "";
}

/**
 * Construit le payload pour /api/score et pour Claude (données structurées).
 * @param {string} playerId
 * @param {Record<string, unknown>} data — JSON landing NHL
 */
export function buildScorePayloadFromLanding(playerId, data) {
  const firstName = namePart(data.firstName);
  const lastName = namePart(data.lastName);
  const playerName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || "—";

  const birthDate = resolveBirthDateString(data);
  const ageYears = ageYearsFromBirthDate(birthDate);

  const seasonId = data.featuredStats?.season;
  const sub = data.featuredStats?.regularSeason?.subSeason;
  const gp = toNum(sub?.gamesPlayed);
  const goals = toNum(sub?.goals);
  const assists = toNum(sub?.assists);
  const points = toNum(sub?.points);
  let pointsPerGame = null;
  if (gp != null && gp > 0 && points != null) {
    pointsPerGame = Math.round((points / gp) * 1000) / 1000;
  }

  const allRows = extractNhlRegularSeasonRows(data.seasonTotals, 100);
  const nhlSeasons = new Set(allRows.map((r) => r.season).filter(Boolean)).size;

  const teamAbbrev =
    data.currentTeamAbbrev != null
      ? String(data.currentTeamAbbrev)
      : data.lastTeamAbbrev != null
        ? String(data.lastTeamAbbrev)
        : null;

  const currentSeasonLabel = formatSeasonLabel(seasonId);
  const sid = seasonId != null ? String(seasonId) : null;
  const pastSeasons = sid
    ? allRows.filter((r) => r.season != null && String(r.season) !== sid)
    : allRows.slice(1);
  const last3Seasons = pastSeasons.slice(0, 3);

  return {
    playerId: String(playerId),
    playerName,
    birthDate,
    ageYears,
    teamAbbrev,
    nhlSeasons,
    currentSeason: {
      seasonId: seasonId != null ? String(seasonId) : null,
      seasonLabel: currentSeasonLabel,
      gamesPlayed: gp,
      goals,
      assists,
      points,
      pointsPerGame,
    },
    lastSeasons: last3Seasons,
    leagueAveragePointsPerGame: NHL_LEAGUE_AVG_PPG,
  };
}

/**
 * @param {number | null} ptsPerGame
 */
function scorePerformance(ptsPerGame) {
  const ppg = Number(ptsPerGame);
  if (!Number.isFinite(ppg) || ppg <= 0) return 0;
  return clampFactor((ppg / 0.6) * 10);
}

/**
 * @param {object | null | undefined} currentSeason
 * @param {Array<{ points?: number | null }>} lastSeasons
 */
function scoreMomentum(currentSeason, lastSeasons) {
  const ptsCurrent = Number(currentSeason?.points);
  const prev = Array.isArray(lastSeasons) ? lastSeasons[0] : null;
  const ptsPrev = Number(prev?.points);

  if (!Number.isFinite(ptsCurrent) || !Number.isFinite(ptsPrev) || ptsPrev <= 0) {
    return 6;
  }

  const delta = (ptsCurrent - ptsPrev) / ptsPrev;
  if (delta >= 0.3) return 10;
  if (delta >= 0.15) return 8;
  if (delta >= 0) return 6;
  if (delta >= -0.1) return 4;
  return 2;
}

/**
 * @param {number | null | undefined} ageYears
 */
function scoreAge(ageYears) {
  const age = Number(ageYears);
  if (!Number.isFinite(age)) return 5;
  if (age >= 20 && age <= 23) return 10;
  if (age >= 24 && age <= 26) return 8;
  if (age >= 27 && age <= 28) return 5;
  if (age >= 29 && age <= 30) return 3;
  if (age >= 31) return 1;
  return 10;
}

/**
 * @param {number | null | undefined} ebayMedianPriceCad
 */
function scoreMarketValue(ebayMedianPriceCad) {
  if (ebayMedianPriceCad == null || !Number.isFinite(Number(ebayMedianPriceCad))) {
    return 6;
  }
  const m = Number(ebayMedianPriceCad);
  if (m < 5) return 10;
  if (m < 15) return 8;
  if (m < 35) return 6;
  if (m < 75) return 4;
  return 2;
}

/**
 * @param {number | null | undefined} ebayListingCount
 */
function scoreLiquidity(ebayListingCount) {
  if (ebayListingCount == null || !Number.isFinite(Number(ebayListingCount))) {
    return 5;
  }
  const c = Number(ebayListingCount);
  if (c > 30) return 9;
  if (c >= 15) return 7;
  if (c >= 5) return 5;
  return 2;
}

/**
 * @param {number | null | undefined} nhlSeasons
 */
function scoreUpside(nhlSeasons) {
  const n = Number(nhlSeasons);
  if (!Number.isFinite(n) || n <= 0) return 6;
  if (n <= 2) return 10;
  if (n <= 4) return 7;
  if (n <= 6) return 4;
  return 2;
}

/**
 * @param {object} input
 */
function scoreHype(input) {
  let s = 3;
  const abbrev = String(input.teamAbbrev ?? "").toUpperCase();
  if (abbrev && CANADIAN_TEAM_ABBREVS.has(abbrev)) s += 3;

  const n = Number(input.nhlSeasons);
  if (Number.isFinite(n) && n <= 2) s += 3;

  const pts = Number(input.points);
  if (Number.isFinite(pts) && pts >= 60) s += 2;

  const ppg = Number(input.ptsPerGame);
  if (Number.isFinite(ppg) && ppg >= 1.0) s += 2;

  return Math.min(10, s);
}

/**
 * @param {ReturnType<typeof buildScorePayloadFromLanding>} payload
 * @param {number | null} [ebayMedianPriceCad]
 * @param {number | null} [ebayListingCount]
 */
export function computeFactorScores(
  payload,
  ebayMedianPriceCad = null,
  ebayListingCount = null
) {
  const cs = payload?.currentSeason ?? {};
  const scores = {
    performance: scorePerformance(cs.pointsPerGame),
    momentum: scoreMomentum(cs, payload?.lastSeasons ?? []),
    age: scoreAge(payload?.ageYears),
    marketValue: scoreMarketValue(ebayMedianPriceCad),
    liquidity: scoreLiquidity(ebayListingCount),
    upside: scoreUpside(payload?.nhlSeasons),
    hype: scoreHype({
      teamAbbrev: payload?.teamAbbrev,
      nhlSeasons: payload?.nhlSeasons,
      points: cs.points,
      ptsPerGame: cs.pointsPerGame,
    }),
  };

  let weightedScore = 0;
  for (const [key, weight] of Object.entries(FACTOR_WEIGHTS)) {
    weightedScore += scores[key] * weight;
  }

  return {
    scores,
    weightedScore: Math.round(weightedScore * 1000) / 1000,
  };
}

/**
 * @param {Record<string, number>} scores
 * @param {number} weightedScore
 * @param {number | null} [scoreAdjustment]
 */
function buildFactorsOutput(scores, weightedScore, scoreAdjustment = null) {
  /** @type {Record<string, { score: number; weight: number } | number>} */
  const factors = {};

  for (const [key, weight] of Object.entries(FACTOR_WEIGHTS)) {
    factors[key] = {
      score: Math.round(scores[key] * 10) / 10,
      weight,
    };
  }

  factors.weightedScore = Math.round(weightedScore * 1000) / 1000;
  if (scoreAdjustment != null && Number.isFinite(scoreAdjustment)) {
    factors.scoreAdjustment = Math.round(scoreAdjustment * 1000) / 1000;
  }

  return factors;
}

/**
 * @param {number | null} score
 */
export function tierFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return "unknown";
  const s = Number(score);
  if (s >= 7) return "high";
  if (s >= 4) return "mid";
  return "low";
}

/**
 * @param {string} text
 */
function extractJsonObject(text) {
  const trimmed = text.trim();
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
 * @param {unknown} raw
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
export function validateScoreRequestBody(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Corps JSON invalide" };
  }
  if (body.playerId == null || String(body.playerId).trim() === "") {
    return { ok: false, error: "playerId requis" };
  }
  const hasFull =
    typeof body.playerName === "string" &&
    body.playerName.trim() !== "" &&
    body.currentSeason != null &&
    typeof body.currentSeason === "object";
  return { ok: true, payload: body, needsHydration: !hasFull };
}

/**
 * @param {unknown} adjustment
 */
function parseScoreAdjustment(adjustment) {
  const n = Number(adjustment);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(0.5, Math.max(-0.5, n)) * 1000) / 1000;
}

/**
 * @param {unknown} verdict
 */
function normalizeVerdict(verdict) {
  const v = String(verdict ?? "")
    .trim()
    .toLowerCase();
  if (v.includes("acheter") || v.includes("buy")) return "Acheter";
  if (v.includes("éviter") || v.includes("eviter") || v.includes("avoid")) {
    return "Éviter";
  }
  return "Surveiller";
}

/**
 * Appelle Claude pour l'ajustement ±0.5 et le verdict ; les 7 facteurs sont calculés en JS.
 * @param {ReturnType<typeof buildScorePayloadFromLanding>} payload
 * @param {number | null} [ebayMedianPriceCad]
 * @param {number | null} [ebayListingCount]
 */
export async function scoreCardScoutWithClaude(
  payload,
  ebayMedianPriceCad = null,
  ebayListingCount = null
) {
  const { scores, weightedScore } = computeFactorScores(
    payload,
    ebayMedianPriceCad,
    ebayListingCount
  );

  const baseFactors = buildFactorsOutput(scores, weightedScore);

  const fail = (error) => ({
    ok: false,
    score: null,
    verdict: null,
    reasoning: null,
    factors: baseFactors,
    tier: "unknown",
    error,
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail("ANTHROPIC_API_KEY manquant");
  }

  const factorLines = Object.entries(FACTOR_WEIGHTS)
    .map(([key, weight]) => {
      const s = scores[key];
      return `- ${key} (${Math.round(weight * 100)}%) : ${s}/10`;
    })
    .join("\n");

  const userBlock = [
    "Voici les données du joueur et les 7 facteurs DÉJÀ calculés.",
    "Ne recalcule pas les facteurs. Ajuste seulement scoreAdjustment (±0.5 max) si le contexte le justifie.",
    "",
    `Score pondéré mathématique : ${weightedScore.toFixed(3)}/10`,
    "",
    "Facteurs :",
    factorLines,
    "",
    "Données joueur (JSON) :",
    JSON.stringify(payload, null, 2),
  ].join("\n");

  let responseText = "";
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userBlock }],
      }),
      cache: "no-store",
    });

    const raw = await res.text();
    if (!res.ok) {
      return fail(`Anthropic ${res.status}: ${raw.slice(0, 200)}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fail("Réponse Anthropic illisible");
    }

    const blocks = parsed?.content;
    if (!Array.isArray(blocks)) {
      return fail("Format de réponse inattendu");
    }

    const textBlock = blocks.find((b) => b?.type === "text");
    responseText = textBlock?.text ?? "";
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erreur réseau");
  }

  const obj = extractJsonObject(responseText);
  if (!obj || typeof obj !== "object") {
    return fail("JSON modèle invalide");
  }

  const scoreAdjustment = parseScoreAdjustment(obj.scoreAdjustment);
  let score = weightedScore + scoreAdjustment;
  score = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;

  const verdict = normalizeVerdict(obj.verdict);
  const reasoning =
    typeof obj.reasoning === "string" && obj.reasoning.trim()
      ? obj.reasoning.trim()
      : "Analyse non disponible.";

  const factors = buildFactorsOutput(scores, weightedScore, scoreAdjustment);

  return {
    ok: true,
    score,
    verdict,
    reasoning,
    factors,
    tier: tierFromScore(score),
    verdictTone: verdictTone(verdict),
    error: null,
  };
}
