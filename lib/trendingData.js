import "server-only";

import { get, put } from "@vercel/blob";

import { computeCardScoutScore } from "@/lib/cardScoutScoreMath";
import { fetchAvgHockeyCardListingPriceCad } from "@/lib/ebayServer";
import {
  fetchPlayerLanding,
  resolveFullName,
  resolveHeadshotUrl,
  resolveTeamLabel,
} from "@/lib/nhlPlayerLanding";

export const TRENDING_PLAYER_IDS = [
  // Stars établies
  8478402, // McDavid
  8477934, // Crosby
  8480012, // MacKinnon
  8479318, // Draisaitl
  8481540, // Caufield
  8478483, // Marchand
  8480801, // Aho
  8479325, // Tkachuk
  8477492, // Ovechkin
  8480762, // Bedard
  // Jeunes stars
  8482078, // Demidov
  8483515, // Celebrini
  8481533, // Michkov
  8480785, // Stutzle
  8481478, // Byfield
  8482116, // Slafkovsky
  8481600, // Perfetti
  8482671, // Cooley
  8482749, // Schaefer
  8480797, // Suzuki
  // Stars offensives
  8479371, // Pastrnak
  8479339, // Marner
  8478476, // Matthews
  8479400, // Panarin
  8479354, // Kucherov
  8476453, // Giroux
  8480762, // Bedard
  8479683, // Tkachuk M
  8481528, // Reinhart
  8479420, // Hughes J
];

const DEAL_SCORE_MIN = 7;
const DEAL_PRICE_MAX_CAD = 100;

const TRENDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BLOB_CACHE_PATHNAME = "trending-cache.json";

/** @type {{ payload: Awaited<ReturnType<typeof buildTrendingPayloadFresh>> | null; fetchedAt: number }} */
let trendingMemoryCache = {
  payload: null,
  fetchedAt: 0,
};

function isBlobCacheEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * @param {number} fetchedAt
 */
function isCacheEntryFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < TRENDING_CACHE_TTL_MS;
}

/**
 * @returns {Promise<{ fetchedAt: number; payload: object } | null>}
 */
async function readTrendingCacheFromBlob() {
  if (!isBlobCacheEnabled()) return null;
  try {
    const result = await get(BLOB_CACHE_PATHNAME, { access: "private" });
    if (!result?.url) return null;
    const response = await fetch(result.url);
    if (!response.ok) return null;
    const parsed = await response.json();
    const fetchedAt = Number(parsed?.fetchedAt);
    const payload = parsed?.payload;
    if (!payload || !isCacheEntryFresh(fetchedAt)) return null;
    return { fetchedAt, payload };
  } catch {
    return null;
  }
}

/**
 * @param {{ fetchedAt: number; payload: object }} entry
 */
async function writeTrendingCacheToBlob(entry) {
  if (!isBlobCacheEnabled()) return;
  try {
    await put(BLOB_CACHE_PATHNAME, JSON.stringify(entry), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    console.error(
      "[trendingData] Échec écriture blob:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * @param {{ fetchedAt: number; payload: object }} entry
 */
function setMemoryCache(entry) {
  trendingMemoryCache = entry;
}

/**
 * @param {object} data
 * @param {string|number} id
 */
function buildPlayerRow(data, id) {
  const fullName = resolveFullName(data);
  const team = resolveTeamLabel(data);
  const headshotUrl = resolveHeadshotUrl(data, id);
  const sub = data.featuredStats?.regularSeason?.subSeason;
  const points = sub?.points;
  const pointsLabel =
    points != null && points !== "" ? String(points) : "—";

  const lastName = data.lastName?.default ?? "";
  const scout = computeCardScoutScore({
    gamesPlayed: sub?.gamesPlayed,
    goals: sub?.goals,
    points: sub?.points,
    lastName,
    fullName,
  });

  return {
    id: String(id),
    name: fullName,
    team,
    headshotUrl,
    points: pointsLabel,
    score: scout.ok ? scout.score : null,
    tier: scout.tier,
    scoutOk: scout.ok,
  };
}

/**
 * @returns {Promise<{
 *   hot: Array<object>;
 *   steals: Array<object>;
 *   stealsUsedPrice: boolean;
 *   carouselPlayers: Array<object>;
 * }>}
 */
async function buildTrendingPayloadFresh() {
  const landings = await Promise.all(
    TRENDING_PLAYER_IDS.map(async (id) => {
      const data = await fetchPlayerLanding(id);
      return data ? { data, id } : null;
    })
  );

  const players = [];
  for (const entry of landings) {
    if (!entry) continue;
    players.push(buildPlayerRow(entry.data, entry.id));
  }

  const withScore = players
    .filter((p) => p.scoutOk && p.score != null)
    .sort((a, b) => Number(b.score) - Number(a.score));

  const hot = withScore.slice(0, 5);

  const candidates = withScore.filter((p) => Number(p.score) >= DEAL_SCORE_MIN);

  const priceRows = await Promise.all(
    candidates.map(async (p) => {
      const price = await fetchAvgHockeyCardListingPriceCad(p.name);
      return { ...p, avgCad: price?.avgCad ?? null, priceSample: price?.count ?? 0 };
    })
  );

  const withCheapCards = priceRows.filter(
    (p) => p.avgCad != null && p.avgCad < DEAL_PRICE_MAX_CAD
  );

  let stealsUsedPrice = withCheapCards.length > 0;

  let stealsPool = stealsUsedPrice
    ? withCheapCards.map((p) => ({
        ...p,
        ratio: Number(p.score) / Math.max(p.avgCad, 1),
      }))
    : candidates.map((p) => ({
        ...p,
        ratio: Number(p.score),
        avgCad: null,
      }));

  stealsPool.sort((a, b) => b.ratio - a.ratio);
  const steals = stealsPool.slice(0, 3).map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    headshotUrl: p.headshotUrl,
    points: p.points,
    score: p.score,
    tier: p.tier,
    avgPriceCad:
      p.avgCad != null ? Math.round(p.avgCad * 100) / 100 : null,
  }));

  return {
    hot,
    steals,
    stealsUsedPrice,
    carouselPlayers: withScore,
  };
}

/**
 * Données trending avec cache Blob (24 h) + mémoire process.
 * @param {{ forceRefresh?: boolean }} [options]
 */
export async function buildTrendingPayload(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh) {
    const blobEntry = await readTrendingCacheFromBlob();
    if (blobEntry) {
      setMemoryCache(blobEntry);
      return structuredClone(blobEntry.payload);
    }

    if (
      trendingMemoryCache.payload &&
      isCacheEntryFresh(trendingMemoryCache.fetchedAt)
    ) {
      return structuredClone(trendingMemoryCache.payload);
    }
  }

  const payload = await buildTrendingPayloadFresh();
  const entry = { fetchedAt: Date.now(), payload };
  setMemoryCache(entry);
  await writeTrendingCacheToBlob(entry);
  return structuredClone(payload);
}
