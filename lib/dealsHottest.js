import "server-only";

import { get, put } from "@vercel/blob";

import {
  buildScorePayloadFromLanding,
  computeFactorScores,
  scoreCardScoutWithClaude,
} from "@/lib/cardScoutScore";
import {
  buildInvestmentIntelligenceFromListings,
  fetchEbayHockeyCardListingsForPlayer,
  getEbayMedianAndCountForPlayer,
  parseCardMode,
} from "@/lib/dealFinder";
import { resolveEbayBearerToken } from "@/lib/ebayServer";
import { fetchPlayerLanding, resolveFullName } from "@/lib/nhlPlayerLanding";
import { TRENDING_PLAYER_IDS } from "@/lib/trendingData";

export const HOTTEST_MAX_CARDS = 12;

const HOTTEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MIN_HOTTEST_INVESTMENT_SCORE = 5.0;
const CARD_SCOUT_SCORE_CONCURRENCY = 5;

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
      investmentScore: 8 + (i % 6) * 0.2,
      cardScoutScore: 8 + (i % 6) * 0.2,
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
 * @param {{ id: string; playerName: string; landing: object }} player
 * @returns {Promise<number | null>}
 */
async function resolveCardScoutScoreForPlayer(player) {
  const scorePayload = buildScorePayloadFromLanding(player.id, player.landing);
  const { medianPriceCad, listingCount } =
    await getEbayMedianAndCountForPlayer(player.playerName);

  if (process.env.ANTHROPIC_API_KEY) {
    const scored = await scoreCardScoutWithClaude(
      scorePayload,
      medianPriceCad,
      listingCount
    );
    if (scored.ok && scored.score != null) {
      return scored.score;
    }
  }

  const { weightedScore } = computeFactorScores(
    scorePayload,
    medianPriceCad,
    listingCount
  );
  return (
    Math.round(Math.min(10, Math.max(0, weightedScore)) * 10) / 10
  );
}

/**
 * @param {Array<{ id: string; playerName: string; landing: object }>} players
 * @returns {Promise<Map<string, number>>}
 */
async function buildCardScoutScoreByPlayerId(players) {
  /** @type {Map<string, number>} */
  const scoresById = new Map();

  for (let i = 0; i < players.length; i += CARD_SCOUT_SCORE_CONCURRENCY) {
    const chunk = players.slice(i, i + CARD_SCOUT_SCORE_CONCURRENCY);
    const scored = await Promise.all(
      chunk.map(async (player) => {
        const score = await resolveCardScoutScoreForPlayer(player);
        return { id: player.id, score };
      })
    );
    for (const { id, score } of scored) {
      if (Number.isFinite(Number(score))) {
        scoresById.set(id, Number(score));
      }
    }
  }

  return scoresById;
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
      return { id: String(id), playerName, landing: data };
    })
  );
  const players = rows.filter(Boolean);
  const cardScoutScoreByPlayerId =
    await buildCardScoutScoreByPlayerId(players);

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
      const cardScoutScore = cardScoutScoreByPlayerId.get(p.id) ?? null;
      return intel.data.listings.map((L) => ({
        ...L,
        playerName: p.playerName,
        playerId: p.id,
        cardScoutScore,
      }));
    })
  );

  const merged = perPlayer.flat();
  const filtered = merged.filter((c) => {
    const v = String(c.verdict ?? "").toLowerCase();
    return (
      v.includes("acheter") &&
      Number(c.cardScoutScore) >= MIN_HOTTEST_INVESTMENT_SCORE
    );
  });
  const cards = filtered
    .sort((a, b) => {
      const aPct = Number(a.percentOfMarket);
      const bPct = Number(b.percentOfMarket);
      const aPrice = Number(a.price);
      const bPrice = Number(b.price);
      const aSort = Number.isFinite(aPct)
        ? aPct
        : Number.isFinite(aPrice)
          ? aPrice
          : Number.POSITIVE_INFINITY;
      const bSort = Number.isFinite(bPct)
        ? bPct
        : Number.isFinite(bPrice)
          ? bPrice
          : Number.POSITIVE_INFINITY;
      return aSort - bSort;
    })
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
