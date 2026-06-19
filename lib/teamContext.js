import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

const STANDINGS_URL = "https://api-web.nhle.com/v1/standings/now";
const CACHE_KEY = "nhl-standings-now";
const CACHE_TTL_HOURS = 12;
const CACHE_TABLE = "cache_generic";

/**
 * Récupère les standings NHL actuels (avec cache Supabase 12h).
 * @returns {Promise<Array<object> | null>}
 */
export async function fetchStandings() {
  const db = getSupabaseAdmin();

  // Cache lookup
  try {
    const { data } = await db
      .from(CACHE_TABLE)
      .select("payload, fetched_at")
      .eq("key", CACHE_KEY)
      .single();
    if (data?.payload && data?.fetched_at) {
      const ageMs = Date.now() - new Date(data.fetched_at).getTime();
      if (ageMs < CACHE_TTL_HOURS * 3600 * 1000) {
        return Array.isArray(data.payload) ? data.payload : null;
      }
    }
  } catch {
    // Pas de cache → on fetch
  }

  // Fresh fetch
  let standings = null;
  try {
    const res = await fetch(STANDINGS_URL, {
      headers: { Accept: "application/json", "User-Agent": "CardScout/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    standings = Array.isArray(json?.standings) ? json.standings : null;
  } catch {
    return null;
  }

  if (!standings) return null;

  // Write to cache (best effort)
  try {
    await db.from(CACHE_TABLE).upsert(
      { key: CACHE_KEY, fetched_at: new Date().toISOString(), payload: standings },
      { onConflict: "key" }
    );
  } catch {
    // Ignore
  }

  return standings;
}

/**
 * Trouve la ligne standings d'une équipe par son abréviation.
 * @param {Array<object>} standings
 * @param {string} teamAbbrev
 */
function findTeamRow(standings, teamAbbrev) {
  if (!Array.isArray(standings)) return null;
  const abbr = String(teamAbbrev ?? "").toUpperCase();
  if (!abbr) return null;
  return (
    standings.find((row) => {
      const candidates = [
        row?.teamAbbrev?.default,
        row?.teamAbbrev,
        row?.teamCommonName?.default,
      ];
      return candidates.some(
        (c) => typeof c === "string" && c.toUpperCase() === abbr
      );
    }) ?? null
  );
}

/**
 * Score 0-10 basé sur la position au classement et la trajectoire récente.
 *
 * Logique :
 *   - President's Trophy (top 1 ligue) → 9-10
 *   - Top 3 division                    → 8
 *   - Wild card / en spot playoff       → 7
 *   - À 5 points d'un spot              → 6 (équipe bulle = intéressant)
 *   - Tanker (worst 5)                  → 3 (loterie peut booster prospects)
 *   - Milieu sans direction              → 5
 *   + Bonus L10 record : 6+ victoires sur 10 = +1
 *   - L10 record  4 victoires sur 10 ou moins = -1
 *
 * @param {object | null} row — ligne standings NHL
 * @returns {number}
 */
function scoreFromStandingsRow(row) {
  if (!row || typeof row !== "object") return 5;

  let s = 5;
  const leagueRank = Number(row.leagueSequence ?? row.leagueRank);
  const divisionSequence = Number(row.divisionSequence);
  const wildcardSequence = Number(row.wildcardSequence);
  const pointPctg = Number(row.pointPctg);

  // President's Trophy contender
  if (Number.isFinite(leagueRank) && leagueRank <= 3) s = 9;
  else if (Number.isFinite(divisionSequence) && divisionSequence <= 3) s = 8;
  else if (Number.isFinite(wildcardSequence) && wildcardSequence > 0 && wildcardSequence <= 2) s = 7;
  else if (Number.isFinite(leagueRank) && leagueRank >= 28) s = 3;
  else if (Number.isFinite(pointPctg)) {
    if (pointPctg >= 0.65) s = 8;
    else if (pointPctg >= 0.55) s = 6.5;
    else if (pointPctg >= 0.45) s = 5;
    else if (pointPctg >= 0.4) s = 4;
    else s = 3.5;
  }

  // Trajectoire L10
  const l10Wins = Number(row.l10Wins);
  if (Number.isFinite(l10Wins)) {
    if (l10Wins >= 7) s += 1;
    else if (l10Wins >= 6) s += 0.5;
    else if (l10Wins <= 3) s -= 1;
    else if (l10Wins <= 4) s -= 0.5;
  }

  return Math.round(Math.min(10, Math.max(0, s)) * 10) / 10;
}

/**
 * Score de contexte d'équipe (0-10) pour une équipe NHL donnée.
 * @param {string | null | undefined} teamAbbrev
 * @returns {Promise<{ score: number; meta: { leagueRank: number|null; divisionRank: number|null; l10Wins: number|null; pointPctg: number|null } | null }>}
 */
export async function fetchTeamContextScore(teamAbbrev) {
  if (!teamAbbrev) {
    return { score: 5, meta: null };
  }
  const standings = await fetchStandings();
  if (!standings) return { score: 5, meta: null };

  const row = findTeamRow(standings, teamAbbrev);
  if (!row) return { score: 5, meta: null };

  const score = scoreFromStandingsRow(row);
  return {
    score,
    meta: {
      leagueRank: Number.isFinite(Number(row.leagueSequence)) ? Number(row.leagueSequence) : null,
      divisionRank: Number.isFinite(Number(row.divisionSequence)) ? Number(row.divisionSequence) : null,
      l10Wins: Number.isFinite(Number(row.l10Wins)) ? Number(row.l10Wins) : null,
      pointPctg: Number.isFinite(Number(row.pointPctg)) ? Number(row.pointPctg) : null,
    },
  };
}
