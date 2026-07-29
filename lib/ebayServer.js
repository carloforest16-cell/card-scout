import "server-only";

import { toAffiliateUrl } from "@/lib/ebayAffiliate";
import { getUsdToCadRateSync } from "@/lib/fxRate";

const EBAY_OAUTH_TOKEN = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_SEARCH =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EBAY_MARKETPLACE_INSIGHTS =
  "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search";

const EBAY_OAUTH_SCOPE =
  process.env.EBAY_OAUTH_SCOPE?.trim() ||
  "https://api.ebay.com/oauth/api_scope";

/** @type {{ token: string; expiresAt: number } | null} */
let ebayTokenCache = null;

/**
 * Jeton application eBay (client_credentials). Côté serveur uniquement.
 * @returns {Promise<string | null>}
 */
export async function getEbayApplicationAccessToken() {
  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }

  const now = Date.now();
  if (ebayTokenCache?.token && ebayTokenCache.expiresAt > now + 60_000) {
    return ebayTokenCache.token;
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`,
    "utf8"
  ).toString("base64");

  let res;
  try {
    res = await fetch(EBAY_OAUTH_TOKEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: EBAY_OAUTH_SCOPE,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("[ebayServer] OAuth token fetch failed:", err?.message ?? err);
    return null;
  }

  if (!res.ok) {
    ebayTokenCache = null;
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  const accessToken =
    typeof data.access_token === "string" ? data.access_token : null;
  if (!accessToken) {
    return null;
  }

  const expiresInSec = Number(data.expires_in);
  const ttlMs =
    Number.isFinite(expiresInSec) && expiresInSec > 0
      ? expiresInSec * 1000
      : 7_200_000;

  ebayTokenCache = {
    token: accessToken,
    expiresAt: now + ttlMs,
  };

  return accessToken;
}

/** OAuth ou jeton statique legacy. */
export async function resolveEbayBearerToken() {
  return (
    (await getEbayApplicationAccessToken()) ||
    process.env.EBAY_ACCESS_TOKEN?.trim() ||
    null
  );
}

/** @param {unknown} value @param {unknown} currency */
export function listingPriceToCad(value, currency) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const c = String(currency || "CAD").toUpperCase();
  if (c === "CAD") return n;
  if (c === "USD") return n * getUsdToCadRateSync();
  return n;
}

const EBAY_GET_ITEM_BY_LEGACY =
  "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id";

/**
 * CONVENTION `shippingCad`, partagée par tout le code qui lit une annonce eBay
 * (`ebayServer`, `dealFinder`, `analyzeListing`, `auctionDeals`) :
 *
 *   0     → port gratuit ANNONCÉ par le vendeur (information fiable)
 *   > 0   → port connu
 *   null  → eBay n'annonce aucun port (calculé selon la destination) = INCONNU
 *
 * Pourquoi c'est critique : traiter `null` comme `0` sous-évalue l'annonce,
 * gonfle son écart « sous la cote » et la fait donc REMONTER en tête de
 * classement. Le biais n'est pas neutre — il sur-représente précisément les
 * annonces dont on ignore le coût réel. Mesuré sur 200 annonces eBay réelles :
 * 15 % n'exposent aucun port côté API *search*, et le port réel de celles-ci va
 * de 20 à 40 $ CAD (soit jusqu'à +58 % sur une carte à 35 $).
 *
 * Piège : `listingPriceToCad` renvoie `null` pour toute valeur <= 0. Le port
 * gratuit doit donc être détecté AVANT cet appel, sinon il est confondu avec un
 * port inconnu.
 */

/**
 * Détail d'une annonce eBay par son ID legacy (celui de l'URL /itm/<id>).
 * priceCad = item + port connu (le port inconnu n'est pas inventé : il vaut 0
 * dans le total, mais `shippingCad` reste null pour que l'appelant le sache).
 * @param {string} legacyItemId
 * @returns {Promise<{ title: string; priceCad: number; shippingCad: number | null; imageUrl: string | null; condition: string | null; url: string | null } | null>}
 */
export async function fetchEbayItemByLegacyId(legacyItemId) {
  const token = await resolveEbayBearerToken();
  if (!token || !legacyItemId) return null;
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const url = new URL(EBAY_GET_ITEM_BY_LEGACY);
  url.searchParams.set("legacy_item_id", String(legacyItemId));

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
    console.error("[ebayServer] fetchEbayItemByLegacyId failed:", err?.message ?? err);
    return null;
  }
  if (!res.ok) return null;

  let item;
  try {
    item = await res.json();
  } catch {
    return null;
  }

  const cur = item?.price?.currency;
  const base = listingPriceToCad(item?.price?.value, cur);
  if (base == null) return null;

  // Trois états DISTINCTS — voir `SHIPPING_STATES` plus haut. Un port inconnu
  // renvoyé comme 0 sous-évaluait l'annonce et faussait toute comparaison.
  let shipCad = null;
  const opt = Array.isArray(item?.shippingOptions) ? item.shippingOptions[0] : null;
  const rawShip = opt?.shippingCost?.value;
  if (rawShip != null) {
    const n = Number(rawShip);
    if (Number.isFinite(n) && n === 0) {
      shipCad = 0;
    } else {
      const s = listingPriceToCad(rawShip, opt.shippingCost.currency ?? cur);
      if (s != null) shipCad = s;
    }
  }

  // Indice joueur depuis les caractéristiques structurées (souvent rempli par
  // le vendeur : « Player/Athlete »), plus fiable que le titre.
  let playerHint = null;
  const aspects = Array.isArray(item?.localizedAspects)
    ? item.localizedAspects
    : [];
  for (const a of aspects) {
    const nm = String(a?.name ?? "").toLowerCase();
    if (nm.includes("player") || nm.includes("athlete")) {
      const val = String(a?.value ?? "").trim();
      if (val) {
        playerHint = val;
        break;
      }
    }
  }

  return {
    title: typeof item?.title === "string" ? item.title : "",
    priceCad: Math.round((base + (shipCad ?? 0)) * 100) / 100,
    basePriceCad: base,
    shippingCad: shipCad,
    imageUrl:
      item?.image?.imageUrl ?? item?.thumbnailImages?.[0]?.imageUrl ?? null,
    condition: typeof item?.condition === "string" ? item.condition : null,
    url: toAffiliateUrl(item?.itemWebUrl) ?? null,
    playerHint,
  };
}

/**
 * Sold comps via eBay Marketplace Insights API.
 * Retourne les ventes réelles (prix de vente final) pour une requête donnée.
 *
 * STATUT : L'ancienne Finding API (findCompletedItems) est décommissionnée
 * depuis février 2025. L'API Marketplace Insights est le seul chemin restant
 * mais requiert un accès élevé (eBay Business / OAuth scope spécial).
 * Retourne { available: false } tant que l'accès n'est pas accordé.
 *
 * Pour demander l'accès : developer.ebay.com → Account → API Access
 * → Request access to "Marketplace Insights API"
 *
 * @param {string} query — ex. "cole caufield young guns hockey card"
 * @param {{ limit?: number; categoryId?: string }} options
 * @returns {Promise<{ available: boolean; soldItems?: Array<{ title: string; soldPriceCad: number; soldDate: string; condition: string | null; imageUrl: string | null }>; totalSold?: number }>}
 */
export async function fetchSoldComps(query, options = {}) {
  const token = await resolveEbayBearerToken();
  if (!token || !query?.trim()) return { available: false };

  const limit = options.limit ?? 20;
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const url = new URL(EBAY_MARKETPLACE_INSIGHTS);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", String(limit));
  if (options.categoryId) url.searchParams.set("category_ids", options.categoryId);

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
    console.error("[ebayServer] fetchSoldComps failed:", err?.message ?? err);
    return { available: false };
  }

  if (res.status === 403) {
    return { available: false };
  }

  if (!res.ok) return { available: false };

  let data;
  try {
    data = await res.json();
  } catch {
    return { available: false };
  }

  const items = Array.isArray(data?.itemSales) ? data.itemSales : [];
  const soldItems = [];
  for (const item of items) {
    const val = item?.lastSoldPrice?.value;
    const cur = item?.lastSoldPrice?.currency;
    const cad = listingPriceToCad(val, cur);
    if (cad == null) continue;
    soldItems.push({
      title: typeof item?.title === "string" ? item.title : "",
      soldPriceCad: Math.round(cad * 100) / 100,
      soldDate: item?.lastSoldDate ?? null,
      condition: item?.condition ?? null,
      imageUrl: item?.image?.imageUrl ?? null,
    });
  }

  return {
    available: soldItems.length > 0,
    soldItems,
    totalSold: typeof data?.total === "number" ? data.total : soldItems.length,
  };
}

/**
 * Prix moyen des premières annonces « hockey card » (approx. CAD).
 * @param {string} fullName
 * @returns {Promise<{ avgCad: number; count: number } | null>}
 */
export async function fetchAvgHockeyCardListingPriceCad(fullName) {
  const token = await resolveEbayBearerToken();
  if (!token || !fullName?.trim()) return null;

  const marketplaceId =
    process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const ebayUrl = new URL(EBAY_BROWSE_SEARCH);
  ebayUrl.searchParams.set("q", `${fullName.trim()} hockey card`);
  ebayUrl.searchParams.set("limit", "5");

  let res;
  try {
    res = await fetch(ebayUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("[ebayServer] fetchAvgHockeyCardListingPriceCad failed:", err?.message ?? err);
    return null;
  }

  if (!res.ok) return null;

  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }

  const summaries = Array.isArray(data.itemSummaries)
    ? data.itemSummaries
    : [];

  const cadValues = [];
  for (const item of summaries) {
    const v = item?.price?.value;
    const cur = item?.price?.currency;
    const cad = listingPriceToCad(v, cur);
    if (cad != null) cadValues.push(cad);
  }

  if (cadValues.length === 0) return null;

  const sum = cadValues.reduce((a, b) => a + b, 0);
  return { avgCad: sum / cadValues.length, count: cadValues.length };
}
