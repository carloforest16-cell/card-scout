import "server-only";

import { get, put } from "@vercel/blob";

import { formatSeasonLabel } from "@/lib/nhlPlayerLanding";
import { verdictTone } from "@/lib/verdictTone";

// ── Score cache (Blob, per-player) ───────────────────────────────────────────

/** 7 jours en saison régulière, 90 jours hors-saison */
function getScoreCacheTTL() {
  const month = new Date().getMonth(); // 0 = janvier
  const inSeason = month >= 9 || month <= 3; // oct–avril
  return inSeason
    ? 7 * 24 * 60 * 60 * 1000
    : 90 * 24 * 60 * 60 * 1000;
}

function isBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** @param {string} playerId */
function scoreCachePath(playerId) {
  // v3 = position-relatif + momentum multi-horizon + pedigree → invalide v2
  return `scores/ai-score-v3-${playerId}.json`;
}

/** @param {string} playerId */
async function readScoreCache(playerId) {
  if (!isBlobEnabled()) return null;
  try {
    const blob = await get(scoreCachePath(playerId), { access: "private" });
    if (!blob?.url) return null;
    const res = await fetch(blob.url);
    if (!res.ok) return null;
    const entry = await res.json();
    const age = Date.now() - Number(entry?.fetchedAt);
    if (!Number.isFinite(age) || age > getScoreCacheTTL()) return null;
    return entry.result ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} playerId
 * @param {object} result
 */
async function writeScoreCache(playerId, result) {
  if (!isBlobEnabled()) return;
  try {
    await put(
      scoreCachePath(playerId),
      JSON.stringify({ fetchedAt: Date.now(), result }),
      { access: "private", allowOverwrite: true, contentType: "application/json" }
    );
  } catch (err) {
    console.error("[scoreCache] write error:", err instanceof Error ? err.message : err);
  }
}

/** Moyenne indicative NHL (pts/match), rappel pour le modÃ¨le */
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

const SYSTEM_PROMPT = `Tu es un expert en cartes de sport NHL et en analyse de marchÃ©.
Les 7 facteurs du Card Scout Score sont DÃ‰JÃ€ calculÃ©s mathÃ©matiquement cÃ´tÃ© serveur.
Tu ne recalcules PAS ces facteurs. Tu ajustes seulement le score global de Â±0.5 maximum selon le contexte qualitatif (blessures rÃ©centes, hype mÃ©diatique, raretÃ© de cartes, etc.).

RÃ©ponds UNIQUEMENT en JSON valide avec ces champs :
{
  "scoreAdjustment": (float entre -0.5 et +0.5),
  "verdict": "Acheter" | "Surveiller" | "Ã‰viter",
  "reasoning": (max 2 phrases, factuelle, en franÃ§ais)
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
 * Lignes saison rÃ©guliÃ¨re NHL, triÃ©es saison dÃ©croissante.
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
 * Forme récente à partir des 5 derniers matchs (déjà inclus dans le landing).
 * @param {unknown} last5Games
 * @returns {{ games: number; points: number; pointsPerGame: number } | null}
 */
function extractRecentForm(last5Games) {
  if (!Array.isArray(last5Games) || last5Games.length === 0) return null;
  let games = 0;
  let points = 0;
  for (const g of last5Games) {
    const p = toNum(g?.points);
    if (p == null) continue;
    games += 1;
    points += p;
  }
  if (games === 0) return null;
  return {
    games,
    points,
    pointsPerGame: Math.round((points / games) * 1000) / 1000,
  };
}

/**
 * Construit le payload pour /api/score et pour Claude (donnÃ©es structurÃ©es).
 * @param {string} playerId
 * @param {Record<string, unknown>} data â€” JSON landing NHL
 */
export function buildScorePayloadFromLanding(playerId, data) {
  const firstName = namePart(data.firstName);
  const lastName = namePart(data.lastName);
  const playerName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || "â€”";

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

  const position = data.position != null ? String(data.position).toUpperCase() : null;
  const recentForm = extractRecentForm(data.last5Games);
  const draftOverall = toNum(data.draftDetails?.overallPick);
  const goalieStats =
    position === "G"
      ? { savePctg: toNum(sub?.savePctg), wins: toNum(sub?.wins) }
      : null;

  return {
    playerId: String(playerId),
    playerName,
    position,
    birthDate,
    ageYears,
    teamAbbrev,
    nhlSeasons,
    draftOverall,
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
    recentForm,
    goalieStats,
    leagueAveragePointsPerGame: NHL_LEAGUE_AVG_PPG,
  };
}

/**
 * @param {number | null} ptsPerGame
 */
function scorePerformance(ptsPerGame, position, goalieStats) {
  const pos = String(position ?? "").toUpperCase();
  if (pos === "G") return scoreGoaliePerformance(goalieStats);

  const ppg = Number(ptsPerGame);
  if (!Number.isFinite(ppg) || ppg <= 0) return 0;

  // Les défenseurs produisent ~0.6× les points d'un attaquant : baselines dédiées.
  if (pos === "D") {
    if (ppg >= 0.9) return 10;   // élite (Makar, Hughes)
    if (ppg >= 0.75) return 9;
    if (ppg >= 0.6) return 8;
    if (ppg >= 0.5) return 7;
    if (ppg >= 0.4) return 6;
    if (ppg >= 0.3) return 5;
    if (ppg >= 0.2) return 3.5;
    if (ppg >= 0.12) return 2;
    return 1;
  }

  // Attaquants — calibré sur la distribution réelle NHL : élite ≈ 1.2+,
  // top-6 solide ≈ 0.7-1.0, moyenne 3e trio ≈ 0.4-0.55.
  if (ppg >= 1.4) return 10;
  if (ppg >= 1.2) return 9;
  if (ppg >= 1.0) return 8;
  if (ppg >= 0.85) return 7;
  if (ppg >= 0.7) return 6;
  if (ppg >= 0.55) return 5;
  if (ppg >= 0.4) return 3.5;
  if (ppg >= 0.25) return 2;
  return 1;
}

/**
 * Performance gardien : le PPG n'a aucun sens, on note sur % d'arrêts + victoires.
 * @param {{ savePctg?: number | null, wins?: number | null } | null | undefined} goalieStats
 */
function scoreGoaliePerformance(goalieStats) {
  const sv = Number(goalieStats?.savePctg);
  const wins = Number(goalieStats?.wins);
  if (!Number.isFinite(sv)) {
    if (Number.isFinite(wins)) return wins >= 25 ? 7 : wins >= 12 ? 5 : 3;
    return 5;
  }
  let s;
  if (sv >= 0.925) s = 10;       // élite (Vézina)
  else if (sv >= 0.915) s = 8.5; // #1 solide
  else if (sv >= 0.905) s = 7;
  else if (sv >= 0.895) s = 5;
  else s = 3;
  if (Number.isFinite(wins) && wins >= 30) s = Math.min(10, s + 1);
  return s;
}

/**
 * @param {object | null | undefined} currentSeason
 * @param {Array<{ points?: number | null }>} lastSeasons
 */
/**
 * Pente de régression linéaire (moindres carrés) du PPG sur les dernières
 * saisons, du plus ancien au plus récent. Unité : PPG gagné par saison.
 * @param {number} currentPpg
 * @param {Array<{ pointsPerGame?: number | null }>} pastSeasons
 * @returns {number | null}
 */
function ppgTrajectorySlope(currentPpg, pastSeasons) {
  const series = [];
  const past = Array.isArray(pastSeasons) ? pastSeasons.slice(0, 3) : [];
  for (let i = past.length - 1; i >= 0; i--) {
    const v = Number(past[i]?.pointsPerGame);
    if (Number.isFinite(v) && v >= 0) series.push(v);
  }
  if (Number.isFinite(currentPpg) && currentPpg >= 0) series.push(currentPpg);
  if (series.length < 2) return null;

  const n = series.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += series[i];
    sxx += i * i;
    sxy += i * series[i];
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom;
}

/** @param {number} slope — PPG/saison */
function slopeToScore(slope) {
  if (slope >= 0.2) return 10;
  if (slope >= 0.1) return 8.5;
  if (slope >= 0.03) return 6.5;
  if (slope >= -0.03) return 5;
  if (slope >= -0.1) return 3.5;
  return 2;
}

/** @param {number} delta — variation relative PPG saison/saison */
function yoyToScore(delta) {
  if (delta >= 0.25) return 10;
  if (delta >= 0.12) return 8.5;
  if (delta >= 0.03) return 6.5;
  if (delta >= -0.05) return 5;
  if (delta >= -0.15) return 3.5;
  return 2;
}

/**
 * Forme récente (5 derniers matchs) relative à la cadence de la saison.
 * @param {number} recentPpg
 * @param {number} seasonPpg
 * @returns {number | null}
 */
function recentFormScore(recentPpg, seasonPpg) {
  if (!Number.isFinite(recentPpg) || !Number.isFinite(seasonPpg) || seasonPpg <= 0) {
    return null;
  }
  const ratio = recentPpg / seasonPpg;
  if (ratio >= 1.4) return 10;  // en feu
  if (ratio >= 1.15) return 8;
  if (ratio >= 0.9) return 6;   // dans sa moyenne
  if (ratio >= 0.7) return 4;
  return 2;                     // froid
}

/**
 * Momentum multi-horizon : trajectoire pluriannuelle (pente), variation
 * saison/saison, et forme récente — pondérées selon les données disponibles.
 * @param {object | null | undefined} currentSeason
 * @param {Array<{ pointsPerGame?: number | null }>} lastSeasons
 * @param {{ pointsPerGame?: number | null } | null | undefined} recentForm
 */
function scoreMomentum(currentSeason, lastSeasons, recentForm) {
  const ppgCurrent = Number(currentSeason?.pointsPerGame);
  const prev = Array.isArray(lastSeasons) ? lastSeasons[0] : null;
  const ppgPrev = Number(prev?.pointsPerGame);
  const recentPpg = Number(recentForm?.pointsPerGame);

  // Recrue / sans historique : production actuelle + forme récente.
  // Capte le cas « jeune qui débarque au match 30 et performe ».
  if (!Number.isFinite(ppgPrev) || ppgPrev <= 0) {
    let base;
    if (!Number.isFinite(ppgCurrent)) base = 6;
    else if (ppgCurrent >= 0.9) base = 10;
    else if (ppgCurrent >= 0.65) base = 8;
    else if (ppgCurrent >= 0.4) base = 6;
    else base = 4;
    const rf = recentFormScore(recentPpg, ppgCurrent);
    if (rf != null) base = base * 0.7 + rf * 0.3;
    return Math.round(clampFactor(base) * 10) / 10;
  }

  /** @type {Array<[number, number]>} composantes [valeur, poids] */
  const components = [];

  const slope = ppgTrajectorySlope(ppgCurrent, lastSeasons);
  if (slope != null) components.push([slopeToScore(slope), 0.5]);

  if (Number.isFinite(ppgCurrent)) {
    components.push([yoyToScore((ppgCurrent - ppgPrev) / ppgPrev), 0.3]);
  }

  const rf = recentFormScore(recentPpg, ppgCurrent);
  if (rf != null) components.push([rf, 0.2]);

  if (components.length === 0) return 5;

  let num = 0;
  let den = 0;
  for (const [val, w] of components) {
    num += val * w;
    den += w;
  }
  return Math.round((num / den) * 10) / 10;
}

/**
 * @param {number | null | undefined} ageYears
 */
function scoreAge(ageYears) {
  const age = Number(ageYears);
  if (!Number.isFinite(age)) return 5;
  // Fenêtre d'appréciation des cartes : jeunesse = upside max, mais les
  // stars établies gardent une valeur (pas de chute brutale à 31 ans).
  if (age <= 23) return 10;
  if (age <= 26) return 8;
  if (age <= 28) return 6;
  if (age <= 30) return 4.5;
  if (age <= 33) return 3;
  return 2;
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
function scoreUpside(nhlSeasons, ageYears, draftOverall) {
  const n = Number(nhlSeasons);
  let base;
  if (!Number.isFinite(n) || n <= 0) base = 6;
  else if (n <= 2) base = 9;
  else if (n <= 4) base = 7;
  else if (n <= 6) base = 4.5;
  else base = 2.5;

  // Pedigree de repêchage : les hauts choix gardent un potentiel + une
  // demande de cartes supérieurs (la cote « prospect » persiste).
  const pick = Number(draftOverall);
  if (Number.isFinite(pick) && pick > 0) {
    if (pick <= 3) base += 1.5;
    else if (pick <= 10) base += 1;
    else if (pick <= 31) base += 0.5;
  }

  // La jeunesse amplifie l'upside ; l'âge avancé le réduit.
  const age = Number(ageYears);
  if (Number.isFinite(age)) {
    if (age <= 21) base += 0.5;
    else if (age >= 30) base -= 1;
  }

  return clampFactor(base);
}

/**
 * @param {object} input
 */
function scoreHype(input) {
  let s = 3;
  const abbrev = String(input.teamAbbrev ?? "").toUpperCase();
  if (abbrev && CANADIAN_TEAM_ABBREVS.has(abbrev)) s += 2.5;

  const n = Number(input.nhlSeasons);
  if (Number.isFinite(n) && n <= 2) s += 2;

  const pts = Number(input.points);
  if (Number.isFinite(pts) && pts >= 60) s += 1.5;

  const ppg = Number(input.ptsPerGame);
  if (Number.isFinite(ppg) && ppg >= 1.0) s += 1.5;

  // Aura de repêchage : un 1er choix au total / top-10 attire la spéculation.
  const pick = Number(input.draftOverall);
  if (Number.isFinite(pick) && pick === 1) s += 1.5;
  else if (Number.isFinite(pick) && pick <= 10) s += 0.8;

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
    performance: scorePerformance(cs.pointsPerGame, payload?.position, payload?.goalieStats),
    momentum: scoreMomentum(cs, payload?.lastSeasons ?? [], payload?.recentForm),
    age: scoreAge(payload?.ageYears),
    marketValue: scoreMarketValue(ebayMedianPriceCad),
    liquidity: scoreLiquidity(ebayListingCount),
    upside: scoreUpside(payload?.nhlSeasons, payload?.ageYears, payload?.draftOverall),
    hype: scoreHype({
      teamAbbrev: payload?.teamAbbrev,
      nhlSeasons: payload?.nhlSeasons,
      points: cs.points,
      ptsPerGame: cs.pointsPerGame,
      draftOverall: payload?.draftOverall,
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
  if (v.includes("Ã©viter") || v.includes("eviter") || v.includes("avoid")) {
    return "Ã‰viter";
  }
  return "Surveiller";
}

/**
 * Appelle Claude pour l'ajustement Â±0.5 et le verdict ; les 7 facteurs sont calculÃ©s en JS.
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

  // ── Cache Blob par joueur ────────────────────────────────────────────────
  const playerId = String(payload?.playerId ?? "");
  if (playerId) {
    const cached = await readScoreCache(playerId);
    if (cached) return { ...cached, factors: baseFactors };
  }

  const apiKey = process.env.CS_CLAUDE_KEY;
  if (!apiKey) {
    return fail("CS_CLAUDE_KEY manquant");
  }

  const factorLines = Object.entries(FACTOR_WEIGHTS)
    .map(([key, weight]) => {
      const s = scores[key];
      return `- ${key} (${Math.round(weight * 100)}%) : ${s}/10`;
    })
    .join("\n");

  const userBlock = [
    "Voici les donnÃ©es du joueur et les 7 facteurs DÃ‰JÃ€ calculÃ©s.",
    "Ne recalcule pas les facteurs. Ajuste seulement scoreAdjustment (Â±0.5 max) si le contexte le justifie.",
    "",
    `Score pondÃ©rÃ© mathÃ©matique : ${weightedScore.toFixed(3)}/10`,
    "",
    "Facteurs :",
    factorLines,
    "",
    "DonnÃ©es joueur (JSON) :",
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
      return fail("RÃ©ponse Anthropic illisible");
    }

    const blocks = parsed?.content;
    if (!Array.isArray(blocks)) {
      return fail("Format de rÃ©ponse inattendu");
    }

    const textBlock = blocks.find((b) => b?.type === "text");
    responseText = textBlock?.text ?? "";
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Erreur rÃ©seau");
  }

  const obj = extractJsonObject(responseText);
  if (!obj || typeof obj !== "object") {
    return fail("JSON modÃ¨le invalide");
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

  const result = {
    ok: true,
    score,
    verdict,
    reasoning,
    factors,
    tier: tierFromScore(score),
    verdictTone: verdictTone(verdict),
    error: null,
  };

  if (playerId) {
    writeScoreCache(playerId, result).catch(() => {});
  }

  return result;
}
