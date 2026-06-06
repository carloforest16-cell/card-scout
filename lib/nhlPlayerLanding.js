import "server-only";

const LANDING_BASE = "https://api-web.nhle.com/v1/player";
const LANDING_MEMORY_TTL_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, { data: object | null; fetchedAt: number }>} */
const landingMemoryCache = new Map();

/**
 * @param {string|number} playerId
 * @returns {Promise<object | null>}
 */
export async function fetchPlayerLanding(playerId) {
  const id = String(playerId);
  const hit = landingMemoryCache.get(id);
  if (hit && Date.now() - hit.fetchedAt < LANDING_MEMORY_TTL_MS) {
    return hit.data;
  }

  const res = await fetch(`${LANDING_BASE}/${playerId}/landing`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "CardScout/1.0",
    },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    landingMemoryCache.set(id, { data: null, fetchedAt: Date.now() });
    return null;
  }
  try {
    const data = await res.json();
    landingMemoryCache.set(id, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    landingMemoryCache.set(id, { data: null, fetchedAt: Date.now() });
    return null;
  }
}

/**
 * @param {object} data
 * @param {string|number} playerId
 * @returns {string}
 */
export function resolveHeadshotUrl(data, playerId) {
  if (typeof data.headshot === "string" && data.headshot.startsWith("http")) {
    return data.headshot;
  }
  const season =
    data.featuredStats?.season != null
      ? String(data.featuredStats.season)
      : "20242025";
  const abbrev = data.currentTeamAbbrev || data.lastTeamAbbrev;
  if (abbrev) {
    return `https://assets.nhle.com/mugs/nhl/${season}/${abbrev}/${playerId}.png`;
  }
  return `https://assets.nhle.com/mugs/nhl/${season}/${playerId}.png`;
}

/**
 * @param {object} data
 * @returns {string}
 */
export function resolveTeamLabel(data) {
  return (
    data.fullTeamName?.default ??
    data.currentTeamAbbrev ??
    data.lastTeamAbbrev ??
    "—"
  );
}

/**
 * @param {object} data
 * @returns {string}
 */
export function resolveFullName(data) {
  const first = data.firstName?.default ?? "";
  const last = data.lastName?.default ?? "";
  return [first, last].filter(Boolean).join(" ").trim() || "—";
}

/**
 * @param {string|number|undefined|null} seasonId
 */
export function formatSeasonLabel(seasonId) {
  if (seasonId == null) return null;
  const s = String(seasonId);
  if (s.length !== 8) return s;
  const start = s.slice(0, 4);
  const endFull = s.slice(4, 8);
  const endShort = endFull.slice(2);
  return `${start}-${endShort}`;
}

/**
 * @param {object} data
 * @returns {string | null}
 */
export function resolveTeamLogoUrl(data) {
  if (typeof data.teamLogo === "string" && data.teamLogo.startsWith("http")) {
    return data.teamLogo;
  }
  const abbrev = data.currentTeamAbbrev || data.lastTeamAbbrev;
  if (!abbrev) return null;
  return `https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`;
}

const NHL_GAME_TYPE_REGULAR = 2;

/**
 * @param {unknown} seasonTotals
 * @returns {Array<{ key: string; season: string; team: string; mj: string | number; goals: string | number; assists: string | number; points: string | number; ppg: string }>}
 */
export function buildNhlRegularSeasonHistory(seasonTotals) {
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

  return filtered.map((r, i) => {
    const gp = Number(r.gamesPlayed);
    const pts = r.points != null ? Number(r.points) : NaN;
    let ppg = "—";
    if (Number.isFinite(gp) && gp > 0 && Number.isFinite(pts)) {
      ppg = (pts / gp).toFixed(2).replace(".", ",");
    }

    const seasonLabel = formatSeasonLabel(r.season);
    const team =
      r.teamName?.default ??
      r.teamCommonName?.default ??
      r.teamAbbrev ??
      "—";

    return {
      key: `${r.season}-${r.sequence ?? i}`,
      season: seasonLabel,
      team,
      mj: r.gamesPlayed ?? "—",
      goals: r.goals ?? "—",
      assists: r.assists ?? "—",
      points: r.points ?? "—",
      ppg,
    };
  });
}
