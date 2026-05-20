import "server-only";

import { formatSeasonLabel } from "@/lib/nhlPlayerLanding";
import { verdictTone } from "@/lib/verdictTone";

/** Moyenne indicative NHL (pts/match), rappel pour le modèle */
export const NHL_LEAGUE_AVG_PPG = 0.6;

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const SYSTEM_PROMPT = `Tu es un expert en cartes de sport NHL et en analyse de marché. 
Tu analyses les données d'un joueur NHL pour déterminer si ses cartes de collection sont undervalued sur le marché secondaire.
Réponds UNIQUEMENT en JSON valide avec ces champs :
{
  "score": (nombre 0-10 avec 1 décimale),
  "verdict": (une phrase courte : Acheter / Surveiller / Éviter),
  "reasoning": (2-3 phrases d'analyse en français),
  "factors": {
    "performance": (score 0-10),
    "trajectory": (score 0-10),
    "marketValue": (score 0-10),
    "age": (score 0-10)
  }
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

  const rows = extractNhlRegularSeasonRows(data.seasonTotals, 8);
  const currentSeasonLabel = formatSeasonLabel(seasonId);
  const sid = seasonId != null ? String(seasonId) : null;
  const pastSeasons = sid
    ? rows.filter((r) => r.season != null && String(r.season) !== sid)
    : rows;
  const last3Seasons = pastSeasons.slice(0, 3);

  return {
    playerId: String(playerId),
    playerName,
    birthDate,
    ageYears,
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
 * @param {unknown} raw
 */
function clampFactor(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.min(10, Math.max(0, x));
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
 * @param {unknown} body
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
 * Appelle Claude et retourne le score structuré.
 * @param {ReturnType<typeof buildScorePayloadFromLanding>} payload
 */
export async function scoreCardScoutWithClaude(payload) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      score: null,
      verdict: null,
      reasoning: null,
      factors: null,
      tier: "unknown",
      error: "ANTHROPIC_API_KEY manquant",
    };
  }

  const userBlock = [
    "Voici les données du joueur (JSON). Utilise la moyenne NHL indicative de",
    String(NHL_LEAGUE_AVG_PPG),
    "points par match pour contextualiser la production.",
    "",
    JSON.stringify(payload, null, 2),
  ].join(" ");

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
        max_tokens: 900,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userBlock }],
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        score: null,
        verdict: null,
        reasoning: null,
        factors: null,
        tier: "unknown",
        error: `Anthropic ${res.status}: ${raw.slice(0, 200)}`,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        score: null,
        verdict: null,
        reasoning: null,
        factors: null,
        tier: "unknown",
        error: "Réponse Anthropic illisible",
      };
    }

    const blocks = parsed?.content;
    if (!Array.isArray(blocks)) {
      return {
        ok: false,
        score: null,
        verdict: null,
        reasoning: null,
        factors: null,
        tier: "unknown",
        error: "Format de réponse inattendu",
      };
    }

    const textBlock = blocks.find((b) => b?.type === "text");
    responseText = textBlock?.text ?? "";
  } catch (e) {
    return {
      ok: false,
      score: null,
      verdict: null,
      reasoning: null,
      factors: null,
      tier: "unknown",
      error: e instanceof Error ? e.message : "Erreur réseau",
    };
  }

  const obj = extractJsonObject(responseText);
  if (!obj || typeof obj !== "object") {
    return {
      ok: false,
      score: null,
      verdict: null,
      reasoning: null,
      factors: null,
      tier: "unknown",
      error: "JSON modèle invalide",
    };
  }

  const scoreRaw = obj.score;
  let score = Number(scoreRaw);
  if (!Number.isFinite(score)) {
    return {
      ok: false,
      score: null,
      verdict: null,
      reasoning: null,
      factors: null,
      tier: "unknown",
      error: "Champ score manquant ou invalide",
    };
  }
  score = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;

  const verdict =
    typeof obj.verdict === "string" ? obj.verdict.trim() : "Surveiller";
  const reasoning =
    typeof obj.reasoning === "string"
      ? obj.reasoning.trim()
      : "Analyse non disponible.";

  const F = obj.factors && typeof obj.factors === "object" ? obj.factors : {};
  const factors = {
    performance: clampFactor(F.performance),
    trajectory: clampFactor(F.trajectory),
    marketValue: clampFactor(F.marketValue),
    age: clampFactor(F.age),
  };

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
