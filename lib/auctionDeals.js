import "server-only";

import {
  computeFairValueByFingerprint,
  cohortKeyForTitle,
  detectCardGroup,
  fetchEbayHockeyCardListingsForPlayer,
  shouldExcludeTitle,
} from "@/lib/dealFinder";
import { listingPriceToCad, resolveEbayBearerToken } from "@/lib/ebayServer";
import { toAffiliateUrl } from "@/lib/ebayAffiliate";
import { fetchPlayerLanding, resolveFullName } from "@/lib/nhlPlayerLanding";
import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { runInBackground } from "@/lib/backgroundTask";
import { TRENDING_PLAYER_IDS } from "@/lib/trendingData";

const EBAY_BROWSE_SEARCH =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";

const AUCTION_CACHE_PATHNAME = "auction-deals-cache-v1.json";
const AUCTION_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — les enchères bougent vite
const ENDING_SOON_HOURS = 24;
const DEAL_THRESHOLD = 0.85; // bid ≤ 85% de la fair value = vrai deal
const MIN_FAIR_VALUE_CAD = 8; // ignore les cohortes trop bon marché (bruit)
const MAX_PER_PLAYER = 3;
const MAX_TOTAL = 24;
const PLAYER_CONCURRENCY = 5;

/** @type {{ fetchedAt: number; payload: object | null }} */
let auctionMemoryCache = { fetchedAt: 0, payload: null };

function isCacheFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < AUCTION_CACHE_TTL_MS;
}

/**
 * Map un item summary eBay (mode AUCTION) → record interne.
 * @param {object} item
 * @returns {object | null}
 */
function mapAuctionListing(item) {
  const buyingOptions = Array.isArray(item?.buyingOptions) ? item.buyingOptions : [];
  if (!buyingOptions.includes("AUCTION")) return null;

  const title = typeof item?.title === "string" ? item.title : "";
  if (!title) return null;

  // Pour les enchères, le prix courant est dans currentBidPrice
  // (fallback price.value si l'enchère n'a pas encore reçu d'offre)
  const bid = item?.currentBidPrice ?? item?.price;
  const bidCad = listingPriceToCad(bid?.value, bid?.currency);
  if (bidCad == null) return null;

  let shipCad = 0;
  const opt = Array.isArray(item?.shippingOptions) ? item.shippingOptions[0] : null;
  const shipVal = opt?.shippingCost?.value;
  if (shipVal != null) {
    const s = listingPriceToCad(shipVal, opt?.shippingCost?.currency ?? bid?.currency);
    if (s != null) shipCad = s;
  }

  const endIso = item?.itemEndDate ?? null;
  if (!endIso) return null;
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(endMs)) return null;

  return {
    title,
    priceCad: Math.round((bidCad + shipCad) * 100) / 100,
    bidCad: Math.round(bidCad * 100) / 100,
    shippingCad: shipCad,
    bidCount: Number(item?.bidCount) || 0,
    endAt: new Date(endMs).toISOString(),
    imageUrl: item?.image?.imageUrl ?? item?.thumbnailImages?.[0]?.imageUrl ?? null,
    url: toAffiliateUrl(item?.itemWebUrl) ?? null,
    itemId: item?.itemId ?? null,
  };
}

/**
 * Fetch les enchères eBay pour un joueur (filtre buyingOptions:AUCTION).
 * @param {string} playerName
 * @param {string} token
 * @param {string} marketplaceId
 */
async function fetchEbayAuctionsForPlayer(playerName, token, marketplaceId) {
  const name = playerName?.trim();
  if (!name) return [];

  const url = new URL(EBAY_BROWSE_SEARCH);
  url.searchParams.set("q", `${name} hockey card`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("filter", "buyingOptions:{AUCTION}");
  url.searchParams.set("sort", "endingSoonest");

  let res;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  let data;
  try { data = await res.json(); } catch { return []; }

  const summaries = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];
  const auctions = [];
  for (const item of summaries) {
    const mapped = mapAuctionListing(item);
    if (!mapped) continue;
    if (shouldExcludeTitle(mapped.title, "raw")) continue;
    auctions.push(mapped);
  }
  return auctions;
}

/**
 * Pour un joueur : récupère ses enchères ET ses fixed-price comps, filtre les
 * enchères endant dans ≤24h avec un bid sous la fair value de leur cohorte.
 * @param {{ id: string; playerName: string }} player
 * @param {string} token
 * @param {string} marketplaceId
 */
/**
 * Médiane des prix d'un tableau de listings.
 * @param {Array<{ priceCad?: number }>} listings
 */
function medianPrice(listings) {
  const prices = listings
    .map((l) => Number(l?.priceCad))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
}

/**
 * Fair value par GROUPE (tous millésimes confondus) — fallback quand la cohorte
 * exacte n'a pas assez de comps.
 * @param {Array<{ title?: string; priceCad?: number }>} comps
 * @returns {Map<string, { fairValueCad: number; comps: number }>}
 */
function computeGroupFairValue(comps) {
  /** @type {Map<string, Array<{ priceCad?: number }>>} */
  const byGroup = new Map();
  for (const l of comps) {
    const group = detectCardGroup(l?.title);
    if (!group) continue;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(l);
  }
  /** @type {Map<string, { fairValueCad: number; comps: number }>} */
  const result = new Map();
  for (const [group, list] of byGroup) {
    if (list.length < 3) continue; // au moins 3 comps pour un groupe
    const med = medianPrice(list);
    if (med == null) continue;
    result.set(group, { fairValueCad: Math.round(med * 100) / 100, comps: list.length });
  }
  return result;
}

async function buildAuctionDealsForPlayer(player, token, marketplaceId) {
  const [auctions, compsResult] = await Promise.all([
    fetchEbayAuctionsForPlayer(player.playerName, token, marketplaceId),
    fetchEbayHockeyCardListingsForPlayer(player.playerName, token, marketplaceId),
  ]);

  if (auctions.length === 0) return [];

  const comps = compsResult?.ok ? compsResult.listings : [];
  const fairMap = computeFairValueByFingerprint(comps);
  const groupFairMap = computeGroupFairValue(comps);
  const now = Date.now();
  const cutoff = now + ENDING_SOON_HOURS * 3600 * 1000;

  const deals = [];
  for (const a of auctions) {
    const endMs = Date.parse(a.endAt);
    if (!Number.isFinite(endMs)) continue;
    if (endMs <= now || endMs > cutoff) continue;

    const group = detectCardGroup(a.title);
    if (!group) continue; // pas de groupe identifiable = pas une carte individuelle reconnue

    // Essai 1 : cohorte exacte (groupe + année + tirage)
    const cohortKey = cohortKeyForTitle(a.title);
    let fairValueCad = null;
    let fairValueComps = 0;
    let confidenceTier = "indicative";

    if (cohortKey) {
      const exact = fairMap.get(cohortKey);
      if (exact?.fairValueCad != null && exact.comps >= 2) {
        fairValueCad = exact.fairValueCad;
        fairValueComps = exact.comps;
        confidenceTier = exact.confidence;
      }
    }

    // Essai 2 : fallback groupe (tous millésimes confondus)
    if (fairValueCad == null) {
      const groupFair = groupFairMap.get(group);
      if (groupFair) {
        fairValueCad = groupFair.fairValueCad;
        fairValueComps = groupFair.comps;
        confidenceTier = "group-fallback";
      }
    }

    if (fairValueCad == null) continue;
    if (fairValueCad < MIN_FAIR_VALUE_CAD) continue;

    const ratio = a.priceCad / fairValueCad;
    if (ratio > DEAL_THRESHOLD) continue;

    const dealPct = Math.round((1 - ratio) * 100);
    const hoursLeft = (endMs - now) / 3600000;

    deals.push({
      ...a,
      playerName: player.playerName,
      playerId: player.id,
      cardType: group,
      fairValueCad,
      fairValueComps,
      fairValueConfidence: confidenceTier,
      dealPct,
      hoursLeft: Math.round(hoursLeft * 10) / 10,
    });
  }

  return deals
    .sort((a, b) => b.dealPct - a.dealPct)
    .slice(0, MAX_PER_PLAYER);
}

/**
 * Construit la liste fraîche des enchères chaudes (top 24).
 * @returns {Promise<{ mocked: boolean; auctions: object[]; playersResolved?: number; generatedAt: string }>}
 */
async function buildAuctionDealsFresh() {
  const token = await resolveEbayBearerToken();
  if (!token) {
    return { mocked: true, auctions: [], playersResolved: 0, generatedAt: new Date().toISOString() };
  }
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

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

  /** @type {object[]} */
  const allDeals = [];
  for (let i = 0; i < players.length; i += PLAYER_CONCURRENCY) {
    const batch = players.slice(i, i + PLAYER_CONCURRENCY);
    const results = await Promise.all(
      batch.map((p) => buildAuctionDealsForPlayer(p, token, marketplaceId))
    );
    for (const list of results) allDeals.push(...list);
  }

  const top = allDeals
    .sort((a, b) => {
      // tri primaire : urgence (enchères qui finissent le plus tôt)
      // pondérée par taille du deal
      const urgencyA = (24 - a.hoursLeft) + a.dealPct * 0.5;
      const urgencyB = (24 - b.hoursLeft) + b.dealPct * 0.5;
      return urgencyB - urgencyA;
    })
    .slice(0, MAX_TOTAL);

  return {
    mocked: false,
    auctions: top,
    playersResolved: players.length,
    generatedAt: new Date().toISOString(),
  };
}

let auctionRebuildInFlight = false;
function scheduleAuctionBackgroundRebuild() {
  if (auctionRebuildInFlight) return;
  auctionRebuildInFlight = true;
  runInBackground(async () => {
    try {
      const fresh = await buildAuctionDealsFresh();
      const entry = { fetchedAt: Date.now(), payload: fresh };
      auctionMemoryCache = entry;
      try { await writeJsonCache(AUCTION_CACHE_PATHNAME, entry); } catch {}
    } finally {
      auctionRebuildInFlight = false;
    }
  });
}

/**
 * Stratégie : mémoire frais → blob frais → stale-while-revalidate → fresh
 * @param {{ forceRefresh?: boolean }} [options]
 */
export async function buildAuctionDealsPayload(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh) {
    if (auctionMemoryCache.payload && isCacheFresh(auctionMemoryCache.fetchedAt)) {
      return { ok: true, ...auctionMemoryCache.payload };
    }

    try {
      const parsed = await readJsonCache(AUCTION_CACHE_PATHNAME);
      const fetchedAt = Number(parsed?.fetchedAt);
      const payload = parsed?.payload;
      if (payload && isCacheFresh(fetchedAt)) {
        auctionMemoryCache = { fetchedAt, payload };
        return { ok: true, ...payload };
      }
      if (payload) {
        // Stale → renvoie + refresh en background
        auctionMemoryCache = { fetchedAt, payload };
        scheduleAuctionBackgroundRebuild();
        return { ok: true, ...payload };
      }
    } catch {
      // pas de cache, continue
    }
  }

  const fresh = await buildAuctionDealsFresh();
  const entry = { fetchedAt: Date.now(), payload: fresh };
  auctionMemoryCache = entry;
  try { await writeJsonCache(AUCTION_CACHE_PATHNAME, entry); } catch {}
  return { ok: true, ...fresh };
}
