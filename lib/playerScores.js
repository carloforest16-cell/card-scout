import "server-only";

import {
  buildScorePayloadFromLanding,
  scoreCardScoutWithClaude,
  tierFromScore,
} from "@/lib/cardScoutScore";
import { getEbayMedianAndCountForPlayer } from "@/lib/dealFinder";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";
import { fetchPlayerGameLog } from "@/lib/nhlPlayerLanding";
import {
  CURRENT_SEASON_ID,
  enrichBirthDatesFromLanding,
  fetchAllBiosForSeason,
  fetchAllSummaryForSeason,
} from "@/lib/opportunitesTop";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

const TABLE = "player_scores";

// Combien de joueurs (top par points) on recalcule à chaque passage du cron.
const PROCESS_LIMIT = 75;
// Filtre d'entrée : ignore les joueurs avec trop peu de matchs (bruit).
const MIN_GAMES_PLAYED = 3;
// Combien de joueurs scorés en parallèle (chacun = 1 landing + 1 eBay + 1 Claude).
const SCORE_CONCURRENCY = 8;
// Au-delà de cette ancienneté, /api/score recalcule en live au lieu de lire la DB.
const STALE_AFTER_MS = 10 * 24 * 60 * 60 * 1000;

/**
 * Lit le score d'un joueur depuis la DB. Retourne null si absent.
 * @param {string} playerId
 * @returns {Promise<{ data: object; computedAt: string } | null>}
 */
export async function getStoredPlayerScore(playerId) {
  const id = String(playerId).trim();
  if (!id) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .select("data, computed_at")
    .eq("player_id", id)
    .maybeSingle();
  if (error || !data) return null;
  return { data: data.data ?? null, computedAt: data.computed_at };
}

/**
 * Vrai si le score stocké est trop vieux pour être servi tel quel.
 * @param {string | null | undefined} computedAt
 */
export function isStoredScoreStale(computedAt) {
  const t = computedAt ? new Date(computedAt).getTime() : NaN;
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > STALE_AFTER_MS;
}

/**
 * Write-through : persiste un score calculé en live dans player_scores.
 * Fire-and-forget — ne bloque jamais la réponse HTTP.
 * @param {{ playerId: string; playerName?: string; team?: string; headshotUrl?: string | null; scoreResult: object; points?: number | null; gamesPlayed?: number | null }} opts
 */
export async function writeBackPlayerScore({ playerId, playerName, team, headshotUrl, scoreResult, points, gamesPlayed }) {
  if (!scoreResult?.ok || scoreResult.score == null) return;
  try {
    const supabase = getSupabaseAdmin();
    const row = {
      player_id: String(playerId),
      player_name: playerName ?? null,
      team: team ?? null,
      score: scoreResult.score,
      tier: scoreResult.tier ?? tierFromScore(scoreResult.score),
      data: scoreResult,
      computed_at: new Date().toISOString(),
      sport: "NHL",
    };
    if (headshotUrl != null) row.headshot_url = headshotUrl;
    if (Number.isFinite(Number(points))) row.points = Number(points);
    if (Number.isFinite(Number(gamesPlayed))) row.games_played = Number(gamesPlayed);
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict: "player_id" });
    if (error) console.error("[playerScores] writeBackPlayerScore failed:", error.message);
  } catch (err) {
    console.error("[playerScores] writeBackPlayerScore failed:", err?.message ?? err);
  }
}

/**
 * Deltas de score 7j pour un lot de joueurs (batché — jamais un appel par
 * carte). Extrait de `/api/dashboard/summary` (tâche 3.3 du plan) pour être
 * réutilisable par toute page qui affiche un score joueur (`/opportunites`,
 * `/pulse`, etc.).
 *
 * Priorité 1 : deux points dans `player_scores_history` (aujourd'hui vs il y a
 * ≥7j) → delta réel. Priorité 2 : un seul point d'historique → score sans
 * delta. Priorité 3 (fallback honnête) : aucun historique → score courant lu
 * dans `player_scores`, jamais de tendance inventée.
 * @param {Array<string | number>} playerIds
 * @returns {Promise<Record<string, { score: number; delta: number | null; direction: "up" | "down" | "flat" | null; hasHistory: boolean; asOfDate?: string }>>}
 */
export async function getScoreDeltas(playerIds) {
  const ids = [...new Set((playerIds ?? []).map((id) => String(id)).filter(Boolean))];
  /** @type {Record<string, { score: number; delta: number | null; direction: "up" | "down" | "flat" | null; hasHistory: boolean; asOfDate?: string }>} */
  const deltas = {};
  if (ids.length === 0) return deltas;

  const admin = getSupabaseAdmin();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [currentRes, pastRes] = await Promise.all([
    admin
      .from("player_scores_history")
      .select("player_id, score, snapshot_date")
      .in("player_id", ids)
      .order("snapshot_date", { ascending: false })
      .limit(ids.length * 2),
    admin
      .from("player_scores_history")
      .select("player_id, score, snapshot_date")
      .in("player_id", ids)
      .lte("snapshot_date", sevenDaysAgo)
      .order("snapshot_date", { ascending: false })
      .limit(ids.length * 2),
  ]);

  const latestByPlayer = new Map();
  (currentRes.data ?? []).forEach((row) => {
    if (!latestByPlayer.has(row.player_id)) latestByPlayer.set(row.player_id, row);
  });
  const pastByPlayer = new Map();
  (pastRes.data ?? []).forEach((row) => {
    if (!pastByPlayer.has(row.player_id)) pastByPlayer.set(row.player_id, row);
  });

  for (const pid of ids) {
    const cur = latestByPlayer.get(pid);
    const past = pastByPlayer.get(pid);
    if (cur && past) {
      const d = Number(cur.score) - Number(past.score);
      deltas[pid] = {
        score: Number(cur.score),
        delta: Number(d.toFixed(2)),
        direction: d > 0.05 ? "up" : d < -0.05 ? "down" : "flat",
        hasHistory: true,
        asOfDate: cur.snapshot_date,
      };
    } else if (cur) {
      deltas[pid] = { score: Number(cur.score), delta: null, direction: "flat", hasHistory: true, asOfDate: cur.snapshot_date };
    }
  }

  // Fallback honnête : aucun snapshot historique pour ce joueur — score
  // courant réel depuis player_scores, jamais de tendance inventée.
  const missingIds = ids.filter((pid) => !deltas[pid]);
  if (missingIds.length > 0) {
    const { data: currentScores } = await admin
      .from("player_scores")
      .select("player_id, score")
      .in("player_id", missingIds);
    (currentScores ?? []).forEach((row) => {
      deltas[row.player_id] = {
        score: Number(row.score),
        delta: null,
        direction: null,
        hasHistory: false,
      };
    });
  }

  return deltas;
}

/**
 * Top N joueurs par score décroissant (pour /opportunites et le carrousel home).
 * @param {number} limit
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function getTopStoredScores(limit = 8) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(TABLE)
    .select("player_id, player_name, team, headshot_url, score, tier, points, games_played, data")
    .order("score", { ascending: false })
    .order("points", { ascending: false })
    .order("player_id", { ascending: true })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data;
}

/**
 * Upsert d'un lot de lignes dans player_scores.
 * @param {Array<Record<string, unknown>>} rows
 */
async function upsertScoreRows(rows) {
  if (rows.length === 0) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "player_id" });
  if (error) throw new Error(`Supabase upsert: ${error.message}`);
}

/**
 * Construit la liste des joueurs à scorer (skaters, top par points).
 * @returns {Promise<Array<{ playerId: string; playerName: string; team: string; points: number; gamesPlayed: number }>>}
 */
async function buildPlayerPool() {
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

  const pool = [];
  for (const row of summaryRows) {
    const id = Number(row.playerId);
    if (!Number.isFinite(id)) continue;
    const games = Number(row.gamesPlayed);
    const points = Number(row.points);
    if (!Number.isFinite(games) || games < MIN_GAMES_PLAYED) continue;
    if (!Number.isFinite(points)) continue;
    const bio = biosById.get(id) ?? {};
    const team =
      row.currentTeamAbbrev != null
        ? String(row.currentTeamAbbrev)
        : bio.currentTeamAbbrev != null
          ? String(bio.currentTeamAbbrev)
          : "—";
    const playerName =
      typeof row.skaterFullName === "string"
        ? row.skaterFullName.trim()
        : typeof bio.skaterFullName === "string"
          ? bio.skaterFullName.trim()
          : "—";
    pool.push({ playerId: String(id), playerName, team, points, gamesPlayed: games });
  }

  pool.sort((a, b) => b.points - a.points);
  return pool.slice(0, PROCESS_LIMIT);
}

/**
 * Score un joueur (frais : eBay + Claude, sans cache par-joueur) et renvoie
 * la ligne DB prête à upsert, ou null si échec.
 * @param {{ playerId: string; playerName: string; team: string; points: number; gamesPlayed: number }} player
 */
async function computeRowForPlayer(player) {
  const landing = await getPlayerLandingCached(player.playerId);
  if (!landing) return null;

  // Game log pour fenêtres glissantes (sous-score Momentum détaillé).
  const seasonId = landing?.featuredStats?.season;
  const gameLog = seasonId
    ? await fetchPlayerGameLog(player.playerId, String(seasonId))
    : null;

  const payload = buildScorePayloadFromLanding(player.playerId, landing, gameLog);
  const { medianPriceCad, listingCount, dealGapPct } =
    await getEbayMedianAndCountForPlayer(player.playerName);

  const result = await scoreCardScoutWithClaude(
    payload,
    medianPriceCad,
    listingCount,
    dealGapPct,
    { skipCache: true, fastMode: true }
  );
  if (!result.ok || result.score == null) return null;

  return {
    player_id: player.playerId,
    player_name: payload.playerName || player.playerName,
    team: payload.teamAbbrev || player.team,
    headshot_url: landing.headshot ?? null,
    score: result.score,
    tier: result.tier ?? tierFromScore(result.score),
    points: Number.isFinite(player.points) ? player.points : null,
    games_played: Number.isFinite(player.gamesPlayed) ? player.gamesPlayed : null,
    data: result,
    computed_at: new Date().toISOString(),
    sport: "NHL",
  };
}

/**
 * Recalcule le pool entier et upsert dans player_scores, par lots.
 * Écrit au fil de l'eau : un timeout laisse quand même les lots traités en DB.
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ processed: number; written: number }>}
 */
export async function recomputeAllScores(options = {}) {
  const pool = await buildPlayerPool();
  const capped =
    Number.isFinite(options.limit) && options.limit > 0
      ? pool.slice(0, options.limit)
      : pool;

  let written = 0;
  for (let i = 0; i < capped.length; i += SCORE_CONCURRENCY) {
    const chunk = capped.slice(i, i + SCORE_CONCURRENCY);
    const rows = (
      await Promise.all(chunk.map((p) => computeRowForPlayer(p).catch(() => null)))
    ).filter(Boolean);
    await upsertScoreRows(rows);
    written += rows.length;
  }

  return { processed: capped.length, written };
}
