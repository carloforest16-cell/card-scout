import "server-only";

import { fetchStandings } from "@/lib/teamContext";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

const SCHEDULE_TTL_HOURS = 24;
const CACHE_TABLE = "cache_generic";

/** Rivalités traditionnelles NHL — utilisées pour booster les catalyseurs. */
const RIVALRIES = [
  ["MTL", "TOR"],
  ["MTL", "BOS"],
  ["EDM", "CGY"],
  ["VAN", "EDM"],
  ["NYR", "NYI"],
  ["NYR", "NJD"],
  ["PHI", "PIT"],
  ["CHI", "DET"],
  ["COL", "VGK"],
  ["TBL", "FLA"],
];

function areRivals(teamA, teamB) {
  const a = String(teamA ?? "").toUpperCase();
  const b = String(teamB ?? "").toUpperCase();
  if (!a || !b) return false;
  return RIVALRIES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * Fetch le calendrier d'une équipe (saison entière) avec cache Supabase 24h.
 * @param {string} teamAbbrev
 * @returns {Promise<Array<object> | null>}
 */
async function fetchTeamSchedule(teamAbbrev) {
  const abbr = String(teamAbbrev ?? "").toUpperCase();
  if (!abbr) return null;

  const key = `nhl-schedule-${abbr}`;
  const db = getSupabaseAdmin();

  try {
    const { data } = await db
      .from(CACHE_TABLE)
      .select("payload, fetched_at")
      .eq("key", key)
      .single();
    if (data?.payload && data?.fetched_at) {
      const ageMs = Date.now() - new Date(data.fetched_at).getTime();
      if (ageMs < SCHEDULE_TTL_HOURS * 3600 * 1000) {
        return Array.isArray(data.payload) ? data.payload : null;
      }
    }
  } catch {
    // pas de cache
  }

  let games = null;
  try {
    const res = await fetch(
      `https://api-web.nhle.com/v1/club-schedule-season/${abbr}/now`,
      {
        headers: { Accept: "application/json", "User-Agent": "CardScout/1.0" },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    games = Array.isArray(json?.games) ? json.games : null;
  } catch {
    return null;
  }

  if (games) {
    try {
      await db.from(CACHE_TABLE).upsert(
        { key, fetched_at: new Date().toISOString(), payload: games },
        { onConflict: "key" }
      );
    } catch {
      // ignore
    }
  }

  return games;
}

/**
 * Détecte si un match est nationalement télédiffusé.
 * Approximation : broadcast list contient un réseau national.
 * @param {object} game
 */
function isNationalBroadcast(game) {
  const broadcasts = Array.isArray(game?.tvBroadcasts) ? game.tvBroadcasts : [];
  const nationalKeywords = ["NATIONAL", "NHLN", "TNT", "ESPN", "ABC", "SN", "CBC", "TVAS", "TVA"];
  return broadcasts.some((b) => {
    const market = String(b?.market ?? "").toUpperCase();
    const network = String(b?.network ?? "").toUpperCase();
    if (market === "N" || market === "NATIONAL") return true;
    return nationalKeywords.some((k) => network.includes(k));
  });
}

/**
 * Milestones proches : repère si le joueur est à ±5 d'un chiffre rond
 * (50, 100, 200, 500, 1000…).
 * @param {object} careerStats — { points, goals, games, seasons }
 * @returns {Array<{ type: string; stat: string; current: number; target: number; remaining: number }>}
 */
function detectMilestonesApproaching(careerStats) {
  const milestones = [];
  const ROUND_NUMBERS = {
    points: [100, 200, 300, 500, 700, 1000, 1500, 2000],
    goals: [50, 100, 200, 300, 500, 700, 1000],
    games: [100, 250, 500, 1000, 1500],
  };

  const stats = {
    points: Number(careerStats?.points),
    goals: Number(careerStats?.goals),
    games: Number(careerStats?.games),
  };

  for (const [stat, targets] of Object.entries(ROUND_NUMBERS)) {
    const value = stats[stat];
    if (!Number.isFinite(value)) continue;
    for (const target of targets) {
      const remaining = target - value;
      if (remaining > 0 && remaining <= 5) {
        milestones.push({
          type: "milestone_approaching",
          stat,
          current: value,
          target,
          remaining,
        });
      }
    }
  }

  return milestones;
}

/**
 * Détecte la proximité d'un spot playoff depuis les standings.
 * @param {object | null} standingsRow
 */
function detectPlayoffProximity(standingsRow) {
  if (!standingsRow) return null;
  // En spot playoff
  const wc = Number(standingsRow.wildcardSequence);
  const div = Number(standingsRow.divisionSequence);
  if ((Number.isFinite(wc) && wc > 0 && wc <= 2) || (Number.isFinite(div) && div <= 3)) {
    return {
      type: "playoff_proximity",
      status: "in_spot",
      meta: { wildcardSequence: wc, divisionSequence: div },
    };
  }
  // À 3 points ou moins d'un spot
  const wcGap = Number(standingsRow.wildcardGap);
  if (Number.isFinite(wcGap) && wcGap > 0 && wcGap <= 3) {
    return {
      type: "playoff_proximity",
      status: "bubble",
      meta: { wildcardGap: wcGap },
    };
  }
  return null;
}

/**
 * Détecte les catalyseurs upcoming pour un joueur.
 *
 * @param {{ teamAbbrev?: string|null; careerStats?: object|null }} player
 * @returns {Promise<{ score: number; catalysts: Array<object>; meta: { gamesUpcoming14d: number } }>}
 */
export async function detectUpcomingCatalysts(player) {
  const catalysts = [];
  const teamAbbrev = player?.teamAbbrev;

  // 1. Milestones
  catalysts.push(...detectMilestonesApproaching(player?.careerStats ?? {}));

  // 2. Standings → playoff proximity
  let standingsRow = null;
  if (teamAbbrev) {
    const standings = await fetchStandings();
    if (standings) {
      const abbr = String(teamAbbrev).toUpperCase();
      standingsRow =
        standings.find((row) => {
          const c = row?.teamAbbrev?.default ?? row?.teamAbbrev;
          return typeof c === "string" && c.toUpperCase() === abbr;
        }) ?? null;
    }
    const playoff = detectPlayoffProximity(standingsRow);
    if (playoff) catalysts.push(playoff);
  }

  // 3. Calendrier upcoming 14 jours
  let gamesUpcoming14d = 0;
  let nationalGames = 0;
  let rivalryGames = 0;
  if (teamAbbrev) {
    const schedule = await fetchTeamSchedule(teamAbbrev);
    if (schedule) {
      const now = Date.now();
      const horizon = now + 14 * 24 * 60 * 60 * 1000;
      for (const g of schedule) {
        const start = new Date(g?.startTimeUTC ?? g?.gameDate ?? 0).getTime();
        if (!Number.isFinite(start)) continue;
        if (start < now || start > horizon) continue;
        gamesUpcoming14d += 1;
        if (isNationalBroadcast(g)) nationalGames += 1;
        const opponent =
          g?.awayTeam?.abbrev === teamAbbrev
            ? g?.homeTeam?.abbrev
            : g?.awayTeam?.abbrev;
        if (opponent && areRivals(teamAbbrev, opponent)) rivalryGames += 1;
      }
    }
  }

  if (nationalGames > 0) {
    catalysts.push({ type: "national_game", count: nationalGames, horizonDays: 14 });
  }
  if (rivalryGames > 0) {
    catalysts.push({ type: "rivalry_game", count: rivalryGames, horizonDays: 14 });
  }

  // Scoring 0-10 : agrégation logarithmique du nombre de catalyseurs.
  let score = 5; // baseline neutre
  const milestones = catalysts.filter((c) => c.type === "milestone_approaching").length;
  const hasPlayoff = catalysts.some((c) => c.type === "playoff_proximity");
  const hasNational = nationalGames > 0;
  const hasRivalry = rivalryGames > 0;

  if (milestones > 0) score += 1.5;
  if (milestones >= 2) score += 0.5;
  if (hasPlayoff) score += 1.5;
  if (hasNational) score += 1.5;
  if (hasNational && nationalGames >= 2) score += 0.5;
  if (hasRivalry) score += 1;

  // Convergence (3+ catalyseurs distincts dans 7 jours) → bonus
  const distinctTypes = new Set(catalysts.map((c) => c.type)).size;
  if (distinctTypes >= 3) score += 1;

  score = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;

  return {
    score,
    catalysts,
    meta: { gamesUpcoming14d, nationalGames, rivalryGames },
  };
}
