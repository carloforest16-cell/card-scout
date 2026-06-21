import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSportConfig } from "@/lib/sportConfig";

/**
 * Underdog Finder — jeunes joueurs NHL prometteurs.
 *
 * Seuils paramétrés via lib/sportConfig.js — préparation multi-sport.
 *
 * L'URL demandée (api-web.nhle.com/v1/skater/summary?…) renvoie actuellement 404 ;
 * on utilise l'API Stats NHL officielle équivalente :
 * GET https://api.nhle.com/stats/rest/en/skater/bios (stats + birthDate, même filtre saison).
 */

const NHL_STATS_SKATER_BIOS =
  "https://api.nhle.com/stats/rest/en/skater/bios";

const NHL_FILTERS = getSportConfig("NHL").candidateFilters;

const CURRENT_SEASON_ID = 20242025;
const PREV_SEASON_ID = 20232024;
const GAME_TYPE_REGULAR = 2;
const PAGE_LIMIT = 100;

const UNDERDOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_KEY = "underdog-cache.json";

/** @type {{ payload: object[] | null; fetchedAt: number }} */
let underdogMemoryCache = {
  payload: null,
  fetchedAt: 0,
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * @param {number} fetchedAt
 */
function isCacheEntryFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < UNDERDOG_CACHE_TTL_MS;
}

async function readUnderdogCacheFromSupabase() {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("cache_generic")
      .select("payload, fetched_at")
      .eq("key", CACHE_KEY)
      .single();
    if (!data?.payload) return null;
    const fetchedAt = new Date(data.fetched_at).getTime();
    if (!isCacheEntryFresh(fetchedAt)) return null;
    const payload = data.payload;
    if (!Array.isArray(payload)) return null;
    return { fetchedAt, payload };
  } catch {
    return null;
  }
}

async function writeUnderdogCacheToSupabase(entry) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("cache_generic").upsert(
      {
        key: CACHE_KEY,
        fetched_at: new Date(entry.fetchedAt).toISOString(),
        payload: entry.payload,
      },
      { onConflict: "key" }
    );
  } catch (err) {
    console.error(
      "[underdogFinder] Échec écriture supabase:",
      err instanceof Error ? err.message : err
    );
  }
}

function setMemoryCache(entry) {
  underdogMemoryCache = entry;
}

/**
 * @param {string} seasonId
 * @param {number} start
 */
async function fetchBiosPage(seasonId, start) {
  const url = new URL(NHL_STATS_SKATER_BIOS);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  url.searchParams.set("start", String(start));
  url.searchParams.set("sort", "points");
  url.searchParams.set("dir", "DESC");
  url.searchParams.set("isAggregate", "false");
  url.searchParams.set("isGame", "false");
  url.searchParams.set(
    "cayenneExp",
    `seasonId=${seasonId} and gameTypeId=${GAME_TYPE_REGULAR}`
  );

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "CardMetrics/1.0 (underdog-finder)",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`NHL bios ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * @param {string|number} seasonId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function fetchAllBiosForSeason(seasonId) {
  const sid = String(seasonId);
  const first = await fetchBiosPage(sid, 0);
  const total = Number(first?.total ?? 0);
  const data = Array.isArray(first?.data) ? [...first.data] : [];
  const starts = [];
  for (let s = PAGE_LIMIT; s < total; s += PAGE_LIMIT) {
    starts.push(s);
  }
  const chunkSize = 5;
  for (let i = 0; i < starts.length; i += chunkSize) {
    const chunk = starts.slice(i, i + chunkSize);
    const pages = await Promise.all(chunk.map((st) => fetchBiosPage(sid, st)));
    for (const p of pages) {
      if (Array.isArray(p?.data)) data.push(...p.data);
    }
  }
  return data;
}

/**
 * @param {unknown} birthDate
 * @returns {boolean}
 */
/**
 * @param {unknown} birthDate
 * @returns {boolean}
 */
function isUnderdogAge(birthDate) {
  if (birthDate == null || birthDate === "") return false;
  const y = parseInt(String(birthDate).slice(0, 4), 10);
  if (!Number.isFinite(y)) return false;
  // Né depuis (année courante - underdogMaxAge) → couvre 18-25 ans.
  const minBirthYear = new Date().getFullYear() - NHL_FILTERS.underdogMaxAge;
  return y >= minBirthYear;
}

/**
 * @param {unknown} birthDate
 * @returns {number | null} âge révolu
 */
function ageYearsFromBirthDate(birthDate) {
  if (birthDate == null || birthDate === "") return null;
  const raw = String(birthDate).trim();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 50 ? age : null;
}

/**
 * @param {number | null} age
 */
function scoreAgeBucket(age) {
  if (age == null) return 5;
  if (age >= 18 && age <= 20) return 10;
  if (age >= 21 && age <= 22) return 8;
  if (age >= 23 && age <= 24) return 6;
  return 4;
}

/**
 * @param {number} ppg
 */
function scorePpg(ppg) {
  if (ppg >= 0.7) return 10;
  if (ppg >= 0.5) return 7;
  if (ppg >= 0.3) return 5;
  return 3;
}

/**
 * Progression vs saison passée (composant /10).
 * @param {number} currPts
 * @param {{ points: number; gamesPlayed: number } | undefined} prev
 */
function scoreProgression(currPts, prev) {
  if (!prev || prev.gamesPlayed < 5) {
    return 8;
  }
  const prevPts = prev.points;
  if (!Number.isFinite(prevPts) || prevPts <= 0) {
    return currPts >= 10 ? 9 : 8;
  }
  const delta = (currPts - prevPts) / prevPts;
  if (delta >= 0.2) return 9;
  if (Math.abs(delta) <= 0.08) return 5;
  if (delta > 0) return 7;
  return 4;
}

/**
 * @param {number} gp
 */
function scoreGames(gp) {
  if (gp >= 60) return 10;
  if (gp >= 40) return 7;
  return 5;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Map<number, { points: number; gamesPlayed: number }>} prevById
 */
function rowToUnderdog(row, prevById) {
  const playerId = Number(row.playerId);
  if (!Number.isFinite(playerId)) return null;

  const birthDate = row.birthDate;
  if (!isUnderdogAge(birthDate)) return null;

  const positionCode = String(row.positionCode ?? "").toUpperCase();
  if (positionCode === "G") return null;

  const gamesPlayed = Number(row.gamesPlayed);
  const points = Number(row.points);
  if (!Number.isFinite(gamesPlayed) || gamesPlayed < NHL_FILTERS.underdogMinGames) return null;
  if (!Number.isFinite(points) || points < NHL_FILTERS.underdogMinPoints) return null;

  const ptsPerGame = gamesPlayed > 0 ? points / gamesPlayed : 0;

  const sPpg = scorePpg(ptsPerGame);
  const age = ageYearsFromBirthDate(birthDate);
  const sAge = scoreAgeBucket(age);
  const sProg = scoreProgression(points, prevById.get(playerId));
  const sGp = scoreGames(gamesPlayed);

  const underdogScore =
    Math.round(
      (0.4 * sPpg + 0.25 * sAge + 0.2 * sProg + 0.15 * sGp) * 10
    ) / 10;

  const abbrev =
    row.currentTeamAbbrev != null ? String(row.currentTeamAbbrev) : "";
  const seasonStr = String(CURRENT_SEASON_ID);
  const headshot = abbrev
    ? `https://assets.nhle.com/mugs/nhl/${seasonStr}/${abbrev}/${playerId}.png`
    : `https://assets.nhle.com/mugs/nhl/${seasonStr}/${playerId}.png`;

  const name =
    typeof row.skaterFullName === "string" ? row.skaterFullName.trim() : "—";
  const team =
    typeof row.currentTeamName === "string"
      ? row.currentTeamName.trim()
      : abbrev || "—";

  return {
    playerId,
    name,
    team,
    age: age ?? null,
    ptsPerGame: Math.round(ptsPerGame * 1000) / 1000,
    gamesPlayed,
    points,
    underdogScore,
    headshot,
    seasonId: CURRENT_SEASON_ID,
  };
}

/**
 * @returns {Promise<object[]>}
 */
async function buildUnderdogPlayersFresh() {
  const [currentRows, prevRows] = await Promise.all([
    fetchAllBiosForSeason(CURRENT_SEASON_ID),
    fetchAllBiosForSeason(PREV_SEASON_ID),
  ]);

  /** @type {Map<number, { points: number; gamesPlayed: number }>} */
  const prevById = new Map();
  for (const r of prevRows) {
    const id = Number(r.playerId);
    if (!Number.isFinite(id)) continue;
    prevById.set(id, {
      points: Number(r.points),
      gamesPlayed: Number(r.gamesPlayed),
    });
  }

  const scored = [];
  for (const row of currentRows) {
    const u = rowToUnderdog(row, prevById);
    if (u) scored.push(u);
  }

  scored.sort((a, b) => b.underdogScore - a.underdogScore);
  return scored.slice(0, 12);
}

/**
 * Jeunes joueurs prometteurs (cache Supabase 24 h + mémoire process).
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<Array<{ playerId: number; name: string; team: string; age: number | null; ptsPerGame: number; gamesPlayed: number; points: number; underdogScore: number; headshot: string; seasonId: number }>>}
 */
export async function getUnderdogPlayers(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh) {
    const cached = await readUnderdogCacheFromSupabase();
    if (cached) {
      setMemoryCache(cached);
      return structuredClone(cached.payload);
    }

    if (
      underdogMemoryCache.payload &&
      isCacheEntryFresh(underdogMemoryCache.fetchedAt)
    ) {
      return structuredClone(underdogMemoryCache.payload);
    }
  }

  const payload = await buildUnderdogPlayersFresh();
  const entry = { fetchedAt: Date.now(), payload };
  setMemoryCache(entry);
  await writeUnderdogCacheToSupabase(entry);
  return structuredClone(payload);
}
