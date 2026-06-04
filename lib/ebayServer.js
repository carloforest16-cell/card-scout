import "server-only";

const EBAY_OAUTH_TOKEN = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_SEARCH =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";
export const EBAY_BROWSE_SEARCH_SOLD =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";

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
    });
  } catch {
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
  if (c === "USD") return n * 1.37;
  return n;
}

const EBAY_GET_ITEM_BY_LEGACY =
  "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id";

/**
 * Détail d'une annonce eBay par son ID legacy (celui de l'URL /itm/<id>).
 * priceCad = item + port (coût total).
 * @param {string} legacyItemId
 * @returns {Promise<{ title: string; priceCad: number; shippingCad: number; imageUrl: string | null; condition: string | null; url: string | null } | null>}
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
    });
  } catch {
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

  let shipCad = 0;
  const opt = Array.isArray(item?.shippingOptions) ? item.shippingOptions[0] : null;
  if (opt?.shippingCost?.value != null) {
    const s = listingPriceToCad(opt.shippingCost.value, opt.shippingCost.currency ?? cur);
    if (s != null) shipCad = s;
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
    priceCad: Math.round((base + shipCad) * 100) / 100,
    shippingCad: shipCad,
    imageUrl:
      item?.image?.imageUrl ?? item?.thumbnailImages?.[0]?.imageUrl ?? null,
    condition: typeof item?.condition === "string" ? item.condition : null,
    url: typeof item?.itemWebUrl === "string" ? item.itemWebUrl : null,
    playerHint,
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
    });
  } catch {
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
