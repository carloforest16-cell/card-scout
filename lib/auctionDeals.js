import "server-only";

import {
  computeFairValueByFingerprint,
  cohortKeyForTitle,
  detectCardGroup,
  fetchEbayHockeyCardListingsForPlayer,
  shouldExcludeTitle,
} from "@/lib/dealFinder";
import { titleMatchesPlayer } from "@/lib/titleFilters";
import { enrichFairMapWith130Point } from "@/lib/soldPrices";
import { normalizeFromFairMapEntry } from "@/lib/marketValue";
import { listingPriceToCad, resolveEbayBearerToken } from "@/lib/ebayServer";
import { toAffiliateUrl } from "@/lib/ebayAffiliate";
import { fetchPlayerLanding, resolveFullName } from "@/lib/nhlPlayerLanding";
import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { runInBackground } from "@/lib/backgroundTask";
import { TRENDING_PLAYER_IDS } from "@/lib/trendingData";

const EBAY_BROWSE_SEARCH =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";

// Scores de qualité par groupe de carte (contribution 0-2.5 pts)
const GROUP_QUALITY = {
  "🏆 Gradée PSA": 2.5,
  "🏆 Gradée BGS/SGC": 2.5,
  "👑 The Cup / Ultimate": 2.5,
  "✍️ Auto / RPA": 2.2,
  "⭐ Young Guns": 2.0,
  "🔄 Young Guns Renewed": 1.8,
  "🔢 Numéroté": 1.8,
  "✨ Clear Cut / Acetate": 1.6,
  "💎 SPx / Premier / Allure": 1.5,
  "🎨 Canvas": 1.3,
  "🎴 OPC Plat / Metal / Flair": 1.2,
  "🎽 Jersey / Patch": 1.2,
  "🌈 Parallèle coloré": 0.8,
  "📦 Autres cartes": 0.5,
};

/**
 * Score enchère 0-10 basé sur : deal %, urgence temps, qualité carte, activité bidding.
 * @param {{ dealPct: number; hoursLeft: number; cardType: string; bidCount: number }} a
 */
function computeAuctionScore(a) {
  // 1) Deal % vs cote (0-4 pts) — chaque % de rabais vaut 0.1 pt, plafonné à 4
  const dealScore = Math.min(4, (a.dealPct / 100) * 10 * 0.4 * 10);

  // 2) Urgence temps (0-3 pts) — courbe exponentielle inverse
  const h = Math.max(0, a.hoursLeft);
  let urgencyScore;
  if (h <= 1) urgencyScore = 3.0;
  else if (h <= 3) urgencyScore = 2.5;
  else if (h <= 6) urgencyScore = 2.0;
  else if (h <= 12) urgencyScore = 1.4;
  else if (h <= 24) urgencyScore = 0.8;
  else urgencyScore = 0.3;

  // 3) Qualité du type de carte (0-2.5 pts)
  const cardScore = GROUP_QUALITY[a.cardType] ?? 0.5;

  // 4) Activité bidding (0-0.5 pt) — indique que d'autres collectionneurs s'y intéressent
  const bidScore = a.bidCount >= 5 ? 0.5 : a.bidCount >= 2 ? 0.3 : a.bidCount >= 1 ? 0.1 : 0;

  const raw = dealScore + urgencyScore + cardScore + bidScore;
  return Math.round(Math.min(10, Math.max(0, raw)) * 10) / 10;
}

const AUCTION_CACHE_PATHNAME = "auction-deals-cache-v2.json";
export const AUCTION_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — les enchères bougent vite
// 24h strict : la page /encheres promet « finissent dans moins de 24 h ».
// L'ancienne valeur (36) laissait passer des enchères à 26h+ sous ce titre
// (audit 2026-07-13). Le scoring d'urgence (h<=24) et le tri (24 - hoursLeft)
// supposent déjà cette fenêtre.
const ENDING_SOON_HOURS = 24;
const DEAL_THRESHOLD = 0.95; // bid sous la fair value (au moins -5%) = deal à montrer
const MIN_FAIR_VALUE_CAD = 5; // ignore les cohortes trop bon marché (bruit)
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

  // Trois états distincts (convention documentée dans `lib/ebayServer.js`) :
  // 0 = gratuit annoncé, > 0 = connu, null = INCONNU. Ne jamais compter un port
  // inconnu comme gratuit — ça sous-évalue le coût total de l'enchère.
  let shipCad = null;
  const opt = Array.isArray(item?.shippingOptions) ? item.shippingOptions[0] : null;
  const shipVal = opt?.shippingCost?.value;
  if (shipVal != null) {
    const n = Number(shipVal);
    if (Number.isFinite(n) && n === 0) {
      shipCad = 0; // gratuit ANNONCÉ — listingPriceToCad renverrait null ici
    } else {
      const s = listingPriceToCad(shipVal, opt?.shippingCost?.currency ?? bid?.currency);
      if (s != null) shipCad = s;
    }
  }

  const endIso = item?.itemEndDate ?? null;
  if (!endIso) return null;
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(endMs)) return null;

  return {
    title,
    priceCad: Math.round((bidCad + (shipCad ?? 0)) * 100) / 100,
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
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("[auctionDeals] fetchEbayAuctionsForPlayer failed:", err?.message ?? err);
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
    // Attribution : eBay renvoie parfois la carte d'un AUTRE joueur (recherche
    // floue). titleMatchesPlayer gère accents (Stützle↔Stutzle) et frères
    // (Quinn≠Jack Hughes) — source partagée lib/titleFilters.js.
    if (!titleMatchesPlayer(name, mapped.title)) continue;
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
  let fairMap = computeFairValueByFingerprint(comps, player.playerName);
  try {
    // Bascule les cohortes en "ventes réelles" 130point quand assez de comps.
    fairMap = await enrichFairMapWith130Point(fairMap, player.playerName);
  } catch (err) {
    // Fallback : on garde la fairMap eBay active — jamais en silence
    // (garde-fou : un catch muet a servi un cache périmé 2 semaines en juin).
    console.error("[auctionDeals] enrichFairMapWith130Point failed, fairMap eBay active conservée:", err?.message ?? err);
  }
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

    // Essai 1 : cohorte exacte (fingerprint complet de la carte)
    const cohortKey = cohortKeyForTitle(a.title, player.playerName);
    let fairValueCad = null;
    let fairValueComps = 0;
    let confidenceTier = "indicative";
    let fairValueSource = null;
    let fairValueRange = null;
    let fairValueLastSale = null;

    if (cohortKey) {
      const exact = fairMap.get(cohortKey);
      if (exact?.fairValueCad != null && exact.comps >= 2) {
        fairValueCad = exact.fairValueCad;
        fairValueComps = exact.comps;
        confidenceTier = exact.confidence;
        fairValueSource = exact.fairValueSource ?? null;
        fairValueRange = exact.range130 ?? null;
        fairValueLastSale = exact.lastSale130 ?? null;
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

    const hoursLeftRounded = Math.round(hoursLeft * 10) / 10;
    const auctionRecord = {
      ...a,
      playerName: player.playerName,
      playerId: player.id,
      cardType: group,
      fairValueCad,
      fairValueComps,
      fairValueConfidence: confidenceTier,
      fairValueSource,
      fairValueRange,
      fairValueLastSale,
      // Métadonnée de provenance normalisée (lib/marketValue.js) — additive,
      // pour les badges honnêtes de la tâche 2.2.
      marketValueMeta: normalizeFromFairMapEntry({
        fairValueCad,
        comps: fairValueComps,
        fairValueSource,
        range130: fairValueRange,
        lastSale130: fairValueLastSale,
      }),
      dealPct,
      hoursLeft: hoursLeftRounded,
    };
    auctionRecord.auctionScore = computeAuctionScore(auctionRecord);
    deals.push(auctionRecord);
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

  // Dédup par itemId — la même annonce eBay peut matcher la recherche de
  // plusieurs joueurs (titre ambigu, carte multi-joueurs), causant sinon des
  // doublons dans le payload final (et des clés React dupliquées côté /encheres).
  const seenItemIds = new Set();
  const dedupedDeals = [];
  for (const deal of allDeals) {
    const key = deal.itemId ?? deal.url;
    if (key && seenItemIds.has(key)) continue;
    if (key) seenItemIds.add(key);
    dedupedDeals.push(deal);
  }

  const top = dedupedDeals
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
 * Lecture pure du cache enchères — jamais de fetch eBay. Retourne
 * { fetchedAt } (frais ou périmé) ou null si aucun cache. Pour la sentinelle
 * de fraîcheur (/api/health) qui ne doit jamais déclencher de coût réseau.
 * @returns {Promise<{ fetchedAt: number } | null>}
 */
export async function readAuctionCacheOnly() {
  if (auctionMemoryCache.payload) return { fetchedAt: auctionMemoryCache.fetchedAt };
  try {
    const parsed = await readJsonCache(AUCTION_CACHE_PATHNAME);
    if (!parsed?.payload) return null;
    return { fetchedAt: Number(parsed.fetchedAt) };
  } catch {
    return null;
  }
}

/**
 * Stratégie : mémoire frais → blob frais → stale-while-revalidate → fresh
 * @param {{ forceRefresh?: boolean }} [options]
 */
export async function buildAuctionDealsPayload(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh) {
    if (auctionMemoryCache.payload && isCacheFresh(auctionMemoryCache.fetchedAt)) {
      return { ok: true, ...auctionMemoryCache.payload, fetchedAt: auctionMemoryCache.fetchedAt };
    }

    try {
      const parsed = await readJsonCache(AUCTION_CACHE_PATHNAME);
      const fetchedAt = Number(parsed?.fetchedAt);
      const payload = parsed?.payload;
      if (payload && isCacheFresh(fetchedAt)) {
        auctionMemoryCache = { fetchedAt, payload };
        return { ok: true, ...payload, fetchedAt };
      }
      if (payload) {
        // Stale → renvoie + refresh en background
        auctionMemoryCache = { fetchedAt, payload };
        scheduleAuctionBackgroundRebuild();
        return { ok: true, ...payload, fetchedAt };
      }
    } catch {
      // pas de cache, continue
    }
  }

  const fresh = await buildAuctionDealsFresh();
  const entry = { fetchedAt: Date.now(), payload: fresh };
  auctionMemoryCache = entry;
  try { await writeJsonCache(AUCTION_CACHE_PATHNAME, entry); } catch {}
  return { ok: true, ...fresh, fetchedAt: entry.fetchedAt };
}
