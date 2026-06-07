import "server-only";

import {
  buildScorePayloadFromLanding,
  scoreCardScoutWithClaude,
  tierFromScore,
} from "@/lib/cardScoutScore";
import { getFreshSoldValueCad } from "@/lib/cardPrices";
import { getEbayMedianAndCountForPlayer } from "@/lib/dealFinder";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";
import {
  CURRENT_SEASON_ID,
  enrichBirthDatesFromLanding,
  fetchAllBiosForSeason,
  fetchAllSummaryForSeason,
} from "@/lib/opportunitesTop";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

const TABLE = "player_scores";

// Combien de joueurs (top par points) on recalcule à chaque passage du cron.
const PROCESS_LIMIT = 150;
// Filtre d'entrée : ignore les joueurs avec trop peu de matchs (bruit).
const MIN_GAMES_PLAYED = 3;
// Combien de joueurs scorés en parallèle (chacun = 1 landing + 1 eBay + 1 Claude).
const SCORE_CONCURRENCY = 5;
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

  const payload = buildScorePayloadFromLanding(player.playerId, landing);
  const { medianPriceCad, listingCount, dealGapPct } =
    await getEbayMedianAndCountForPlayer(player.playerName);

  // Prix vendu réel (SportsCardsPro) s'il est stocké et frais → facteur Marché
  // « demande prouvée » ; sinon le score retombe sur la médiane eBay bornée.
  const soldValueCad = await getFreshSoldValueCad(player.playerId);

  const result = await scoreCardScoutWithClaude(
    payload,
    medianPriceCad,
    listingCount,
    dealGapPct,
    { skipCache: true, soldValueCad }
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
