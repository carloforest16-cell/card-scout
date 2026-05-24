import "server-only";

import { get, put } from "@vercel/blob";

import {
  buildInvestmentIntelligenceFromListings,
  fetchEbayHockeyCardListingsForPlayer,
  parseCardMode,
} from "@/lib/dealFinder";
import { resolveEbayBearerToken } from "@/lib/ebayServer";
import { fetchPlayerLanding, resolveFullName } from "@/lib/nhlPlayerLanding";
import { TRENDING_PLAYER_IDS } from "@/lib/trendingData";

export const HOTTEST_MAX_CARDS = 12;

const HOTTEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** @type {Record<"raw" | "graded", string>} */
const BLOB_CACHE_PATHNAMES = {
  raw: "hottest-deals-raw-cache.json",
  graded: "hottest-deals-graded-cache.json",
};

/** @type {Map<"raw" | "graded", { fetchedAt: number; payload: object | null }>} */
const hottestMemoryCacheByMode = new Map();

/**
 * @param {"raw" | "graded" | string} cardMode
 * @returns {"raw" | "graded"}
 */
function resolveMode(cardMode) {
  return parseCardMode(cardMode);
}

/**
 * @param {"raw" | "graded"} mode
 */
function getMemoryCacheEntry(mode) {
  return hottestMemoryCacheByMode.get(mode) ?? { fetchedAt: 0, payload: null };
}

/**
 * @param {"raw" | "graded"} mode
 * @param {{ fetchedAt: number; payload: object }} entry
 */
function setMemoryCacheEntry(mode, entry) {
  hottestMemoryCacheByMode.set(mode, entry);
}

function isBlobCacheEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * @param {number} fetchedAt
 */
function isCacheEntryFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < HOTTEST_CACHE_TTL_MS;
}

/**
 * @param {"raw" | "graded"} mode
 * @returns {Promise<{ fetchedAt: number; payload: object } | null>}
 */
async function readHottestCacheFromBlob(mode) {
  if (!isBlobCacheEnabled()) return null;
  const pathname = BLOB_CACHE_PATHNAMES[mode];
  try {
    const result = await get(pathname, { access: "private" });
    if (!result.stream) return null;
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    const fetchedAt = Number(parsed?.fetchedAt);
    const payload = parsed?.payload;
    if (!payload || !isCacheEntryFresh(fetchedAt)) return null;
    return { fetchedAt, payload };
  } catch {
    return null;
  }
}

/**
 * @param {"raw" | "graded"} mode
 * @param {{ fetchedAt: number; payload: object }} entry
 */
async function writeHottestCacheToBlob(mode, entry) {
  if (!isBlobCacheEnabled()) return;
  const pathname = BLOB_CACHE_PATHNAMES[mode];
  try {
    await put(pathname, JSON.stringify(entry), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    console.error(
      "[dealsHottest] Échec écriture blob:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Démo sans eBay : cartes fictives triées par % marché pour remplir la section.
 * @param {"raw" | "graded"} cardMode
 * @returns {Array<object>}
 */
function buildMockHottestCards(cardMode) {
  const mode = resolveMode(cardMode);
  const labels = [
    "Connor McDavid",
    "Sidney Crosby",
    "Nathan MacKinnon",
    "Leon Draisaitl",
    "Cole Caufield",
    "Brad Marchand",
    "Auston Matthews",
    "Artemi Panarin",
    "David Pastrnak",
    "Nikita Kucherov",
    "Jack Hughes",
    "Quinn Hughes",
  ];
  return labels
    .slice(0, HOTTEST_MAX_CARDS)
    .map((playerName, i) => ({
      listingIndex: i,
      title:
        mode === "graded"
          ? `${playerName} Young Guns RC PSA 10 Gem Mint (exemple démo)`
          : `${playerName} — Young Guns RC (exemple démo)`,
      price: 72 + i * 4,
      percentOfMarket: 68 + i * 2.5,
      url: "https://www.ebay.ca",
      imageUrl: null,
      groupType: "⭐ Young Guns",
      marketPrice: 95 + i * 5,
      priceConfidence: "high",
      investmentScore: 5.5 + (i % 6) * 0.45,
      holdTimeline: "2–3 saisons",
      upside: "Fort",
      verdict: "Acheter",
      reason: "Démo — branche eBay + Anthropic pour du live.",
      scoreSource: "demo",
      playerName,
      playerId: String(TRENDING_PLAYER_IDS[i] ?? i),
    }))
    .sort((a, b) => Number(a.percentOfMarket) - Number(b.percentOfMarket));
}

/**
 * Agrège les stars NHL : eBay + scores en parallèle, top 12 par % marché croissant.
 * @param {"raw" | "graded" | string} [cardMode]
 * @returns {Promise<{ mocked: boolean; cards: object[]; playersResolved?: number; cardMode: "raw" | "graded" }>}
 */
async function buildHottestDealsFresh(cardMode = "raw") {
  const mode = resolveMode(cardMode);
  const token = await resolveEbayBearerToken();
  if (!token) {
    return {
      mocked: true,
      cards: buildMockHottestCards(mode),
      playersResolved: TRENDING_PLAYER_IDS.length,
      cardMode: mode,
    };
  }

  const marketplaceId =
    process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const rows = await Promise.all(
    TRENDING_PLAYER_IDS.map(async (id) => {
      const data = await fetchPlayerLanding(id);
      if (!data) return null;
      const playerName = resolveFullName(data).trim();
      if (!playerName) return null;
      return { id: String(id), playerName };
    })
  );
  const players = rows.filter(Boolean);

  const perPlayer = await Promise.all(
    players.map(async (p) => {
      const ebay = await fetchEbayHockeyCardListingsForPlayer(
        p.playerName,
        token,
        marketplaceId
      );
      if (!ebay.ok || !ebay.listings.length) return [];
      const intel = await buildInvestmentIntelligenceFromListings(
        p.playerName,
        ebay.listings,
        ebay.totalListings,
        false,
        mode
      );
      if (!intel.ok || !intel.data?.listings?.length) return [];
      return intel.data.listings.map((L) => ({
        ...L,
        playerName: p.playerName,
        playerId: p.id,
      }));
    })
  );

  const merged = perPlayer.flat();
  const cards = merged
    .filter((c) => Number.isFinite(Number(c.percentOfMarket)))
    .sort((a, b) => Number(a.percentOfMarket) - Number(b.percentOfMarket))
    .slice(0, HOTTEST_MAX_CARDS);

  return {
    mocked: false,
    cards,
    playersResolved: players.length,
    cardMode: mode,
  };
}

/**
 * Hottest deals avec cache Blob (6 h) + mémoire process, séparé par mode.
 * @param {{ forceRefresh?: boolean; cardMode?: string; mode?: string }} [options]
 * @returns {Promise<{ ok: true; mocked: boolean; cards: object[]; playersResolved?: number; cardMode?: "raw" | "graded" }>}
 */
export async function buildHottestDealsPayload(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const mode = resolveMode(options.cardMode ?? options.mode);

  if (!forceRefresh) {
    const blobEntry = await readHottestCacheFromBlob(mode);
    if (blobEntry) {
      setMemoryCacheEntry(mode, blobEntry);
      return { ok: true, ...blobEntry.payload };
    }

    const memoryEntry = getMemoryCacheEntry(mode);
    if (memoryEntry.payload && isCacheEntryFresh(memoryEntry.fetchedAt)) {
      return { ok: true, ...memoryEntry.payload };
    }
  }

  const fresh = await buildHottestDealsFresh(mode);
  const entry = { fetchedAt: Date.now(), payload: fresh };
  setMemoryCacheEntry(mode, entry);
  await writeHottestCacheToBlob(mode, entry);
  return { ok: true, ...fresh };
}
