import "server-only";

import {
  fetchAllBiosForSeason,
  fetchAllSummaryForSeason,
  CURRENT_SEASON_ID,
  enrichBirthDatesFromLanding,
} from "@/lib/opportunitesTop";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

const TABLE = "players";
const UPSERT_BATCH = 100;

/**
 * @param {string | null | undefined} birthDate
 * @returns {number | null}
 */
function calcAge(birthDate) {
  if (!birthDate) return null;
  const d = new Date(String(birthDate).trim());
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 60 ? age : null;
}

/**
 * Upsert un batch de lignes dans la table players.
 * @param {object[]} rows
 */
async function upsertBatch(rows) {
  if (rows.length === 0) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "player_id" });
  if (error) throw new Error(`[playerDirectory] upsert failed: ${error.message}`);
}

/**
 * Synchronise tous les patineurs de la saison courante dans la table `players`.
 * Inclut TOUS les patineurs (pas de filtre points/âge) — gardiens inclus si
 * présents dans les données (positionCode "G").
 * @returns {Promise<{ synced: number; errors: number }>}
 */
export async function syncAllPlayers() {
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

  const rows = [];
  let errors = 0;

  for (const summary of summaryRows) {
    try {
      const playerId = Number(summary.playerId);
      if (!Number.isFinite(playerId)) continue;

      const bio = biosById.get(playerId) ?? {};
      const birthDate = bio.birthDate ?? summary.birthDate ?? null;
      const abbrev =
        summary.currentTeamAbbrev != null
          ? String(summary.currentTeamAbbrev)
          : bio.currentTeamAbbrev != null
            ? String(bio.currentTeamAbbrev)
            : null;

      const fullName =
        typeof summary.skaterFullName === "string"
          ? summary.skaterFullName.trim()
          : typeof bio.skaterFullName === "string"
            ? bio.skaterFullName.trim()
            : null;
      if (!fullName) continue;

      const nameParts = fullName.split(" ");
      const firstName = nameParts[0] ?? null;
      const lastName = nameParts.slice(1).join(" ") || null;

      const positionCode = String(
        summary.positionCode ?? bio.positionCode ?? ""
      ).toUpperCase() || null;

      const headshotUrl = abbrev
        ? `https://assets.nhle.com/mugs/nhl/20252026/${abbrev}/${playerId}.png`
        : `https://assets.nhle.com/mugs/nhl/20252026/${playerId}.png`;

      rows.push({
        player_id: String(playerId),
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        team_abbrev: abbrev,
        position_code: positionCode,
        birth_date: birthDate ? String(birthDate).slice(0, 10) : null,
        age: calcAge(birthDate),
        games_played: Number.isFinite(Number(summary.gamesPlayed)) ? Number(summary.gamesPlayed) : null,
        goals: Number.isFinite(Number(summary.goals)) ? Number(summary.goals) : null,
        assists: Number.isFinite(Number(summary.assists)) ? Number(summary.assists) : null,
        points: Number.isFinite(Number(summary.points)) ? Number(summary.points) : null,
        headshot_url: headshotUrl,
        sport: "NHL",
        season_id: CURRENT_SEASON_ID,
        is_active: true,
        synced_at: new Date().toISOString(),
      });
    } catch {
      errors += 1;
    }
  }

  // Upsert par batches
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    await upsertBatch(rows.slice(i, i + UPSERT_BATCH));
  }

  console.log(`[playerDirectory] syncAllPlayers: ${rows.length} synced, ${errors} errors`);
  return { synced: rows.length, errors };
}
