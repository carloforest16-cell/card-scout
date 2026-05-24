import "server-only";

import { get, put } from "@vercel/blob";

import {
  INVESTMENT_SCORE_BATCH_MAX,
  mockInvestmentScores,
  scoreListingsForInvestment,
} from "@/lib/dealInvestmentScore";
import { extractCardFingerprint } from "@/lib/cardNumberExtractor";
import { listingPriceToCad, resolveEbayBearerToken } from "@/lib/ebayServer";

const EBAY_BROWSE_SEARCH =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EBAY_LISTINGS_LIMIT = 100;
const DEAL_BELOW_MEDIAN_RATIO = 0.8;
const DEAL_BELOW_MEDIAN_RATIO_GRADED = 0.97;
const TRIM_LOW_FRACTION = 0.02;
const TRIM_HIGH_FRACTION = 0.15;
const MIN_GROUP_LISTINGS = 2;
const PLAYER_RESULT_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

const CAUFIELD_BLOB_CACHE_PATHNAME = "deals-caufield-cache.json";
const CAUFIELD_BLOB_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CAUFIELD_PLAYER_NAME = "cole caufield";

/** @type {{ fetchedAt: number; result: object | null }} */
let caufieldDealCache = { fetchedAt: 0, result: null };

/** @type {"raw" | "graded"} */
export const CARD_MODE_RAW = "raw";
/** @type {"raw" | "graded"} */
export const CARD_MODE_GRADED = "graded";

/** Compagnies de grading (mode gradé : garder ; mode raw : exclure) */
const GRADING_COMPANY_RE =
  /\b(?:PSA|BGS|SGC|CGC|HGA|KSA|CSG|ISA|GAI|BCCG|GMA|CGA|AGS)\b/i;

/** Signaux slab / grade dans le titre (même logique raw vs gradé) */
const GRADING_SIGNAL_RE =
  /\b(?:Gem\s+Mint|GEM\s+MT|Graded|Slab(?:bed)?|Encapsulated|Certified)\b/i;

/** Note numérique après une compagnie (PSA 9, BGS 9.5, etc.) */
const GRADING_COMPANY_GRADE_RE =
  /\b(?:PSA|BGS|SGC|CGC|HGA|KSA|CSG|ISA|GAI|BCCG|GMA|CGA|AGS)\s*(?:10|9(?:\.5)?|9|8)\b/i;

const GRADING_COMPANY_NAMES =
  "PSA|BGS|SGC|CGC|HGA|KSA|CSG|ISA|GAI|BCCG|GMA|CGA|AGS";

/** @type {Map<string, { fetchedAt: number; result: { ok: true; data: object } | { ok: false; error: string; status?: number; totalListings?: number; validListings?: number; detail?: string } }>} */
const playerResultCache = new Map();

function isBlobCacheEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/**
 * @param {number} fetchedAt
 */
function isCaufieldCacheEntryFresh(fetchedAt) {
  return (
    Number.isFinite(fetchedAt) &&
    Date.now() - fetchedAt < CAUFIELD_BLOB_CACHE_TTL_MS
  );
}

/**
 * @param {string} name
 * @param {"raw" | "graded"} mode
 */
function isCaufieldDealCacheTarget(name, mode) {
  return name.toLowerCase() === CAUFIELD_PLAYER_NAME && mode === CARD_MODE_RAW;
}

/**
 * @returns {Promise<{ fetchedAt: number; result: object } | null>}
 */
async function readCaufieldDealCacheFromBlob() {
  if (!isBlobCacheEnabled()) return null;
  try {
    const blob = await get(CAUFIELD_BLOB_CACHE_PATHNAME, { access: "private" });
    if (!blob?.url) return null;
    const response = await fetch(blob.url);
    if (!response.ok) return null;
    const parsed = await response.json();
    const fetchedAt = Number(parsed?.fetchedAt);
    const result = parsed?.result;
    if (!result || !isCaufieldCacheEntryFresh(fetchedAt)) return null;
    return { fetchedAt, result };
  } catch {
    return null;
  }
}

/**
 * @param {{ fetchedAt: number; result: object }} entry
 */
async function writeCaufieldDealCacheToBlob(entry) {
  if (!isBlobCacheEnabled()) return;
  try {
    await put(CAUFIELD_BLOB_CACHE_PATHNAME, JSON.stringify(entry), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
    });
  } catch (err) {
    console.error(
      "[dealFinder] Échec écriture blob Caufield:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * @param {{ fetchedAt: number; result: object }} entry
 */
function setCaufieldMemoryCache(entry) {
  caufieldDealCache = entry;
}

/**
 * @param {object} result
 */
async function persistCaufieldDealCache(result) {
  const entry = { fetchedAt: Date.now(), result };
  setCaufieldMemoryCache(entry);
  await writeCaufieldDealCacheToBlob(entry);
}

/**
 * @param {string} name
 * @param {"raw" | "graded"} mode
 * @param {{ forceRefresh?: boolean }} options
 * @returns {Promise<object | null>}
 */
async function readCaufieldDealCache(name, mode, options) {
  if (!isCaufieldDealCacheTarget(name, mode) || options.forceRefresh) {
    return null;
  }

  const blobEntry = await readCaufieldDealCacheFromBlob();
  if (blobEntry) {
    setCaufieldMemoryCache(blobEntry);
    return blobEntry.result;
  }

  if (
    caufieldDealCache.result &&
    isCaufieldCacheEntryFresh(caufieldDealCache.fetchedAt)
  ) {
    return caufieldDealCache.result;
  }

  return null;
}

/**
 * @param {string | null | undefined} value
 * @returns {"raw" | "graded"}
 */
export function parseCardMode(value) {
  return value === CARD_MODE_GRADED ? CARD_MODE_GRADED : CARD_MODE_RAW;
}

/**
 * @param {string} title
 * @returns {boolean}
 */
/**
 * Titre contenant un signal de carte gradée (compagnie, slab, note, etc.).
 * @param {string} title
 * @returns {boolean}
 */
export function hasGradingIndicatorInTitle(title) {
  const t = title || "";
  if (GRADING_COMPANY_RE.test(t)) return true;
  if (GRADING_SIGNAL_RE.test(t)) return true;
  if (GRADING_COMPANY_GRADE_RE.test(t)) return true;
  return false;
}

/** @param {string} title */
export function isGradedListing(title) {
  return hasGradingIndicatorInTitle(title);
}

/**
 * @param {string} title
 * @returns {string | null} ex. "psa9", "bgs95"
 */
export function extractGradeKey(title) {
  const m = String(title ?? "").match(
    new RegExp(
      `\\b(${GRADING_COMPANY_NAMES})\\s*(10|9(?:\\.5)?|8)\\b`,
      "i"
    )
  );
  if (!m) return null;
  return `${m[1].toLowerCase()}${m[2].replace(".", "")}`;
}

/**
 * @param {string} bucketKey
 * @returns {string | null}
 */
function extractGradeKeyFromBucketKey(bucketKey) {
  const m = String(bucketKey ?? "").match(
    new RegExp(`^(${GRADING_COMPANY_NAMES})(10|9(?:5)?|8)(?:-|$)`, "i")
  );
  if (!m) return null;
  return `${m[1].toLowerCase()}${m[2]}`;
}

/**
 * @param {string} title
 * @param {"raw" | "graded"} cardMode
 * @returns {boolean}
 */
export function matchesCardMode(title, cardMode) {
  const graded = isGradedListing(title);
  return cardMode === CARD_MODE_GRADED ? graded : !graded;
}

/**
 * @param {Array<{ title: string }>} listings
 * @param {"raw" | "graded"} cardMode
 */
function filterListingsByCardMode(listings, cardMode) {
  return listings.filter((row) => matchesCardMode(row.title, cardMode));
}

const TITLE_EXCLUDE_RE =
  /\b(REPRINT|CUSTOM|FAKE|LOT|BULK|COPY|PROXY|REPRODUCTION)\b|\bLOT\s+OF\b/i;

/** You Pick, lots, bundles — pas une carte précise */
const TITLE_EXCLUDE_PICK_LOT_RE =
  /\b(?:You\s+Pick|U\s+Pick|Your\s+Choice|You\s+Choose|Choose|Lot\s+of|Bundle|Collection|Set\s+of|Pack\s+of|Mystery|Wholesale)\b|~/i;

/** Exclusions additionnelles : fan-made, titres-baits prix, etc. */
const TITLE_EXCLUDE_FAN_OR_BAIT_RE =
  /\b(Fan\s*Art|Fan\s*Made|Novelty|Homemade|Fantasy|Art\s+Card|Read\s+Description|Not\s+Official|1\s*CENT|FREE\s*SHIPPING\s*ONLY)\b/i;

/** Affiches, merch, photos — pas des cartes à collectionner */
const TITLE_EXCLUDE_NON_CARD_RE =
  /\b(?:Poster|Photo|8x10|11x17|Canvas\s+Print|Framed|Plaque|Bobblehead|Figurine|Magazine|Sticker|Decal|Puck|Pennant)\b|\bPrint\b(?!ing)(?!\s+Run)/i;

/**
 * @param {string} title
 * @returns {boolean}
 */
function isStandaloneJerseyListing(title) {
  if (!/\bJersey\b/i.test(title)) return false;
  return !/\b(?:Card|Patch|Relic|Swatch|RPA|Auto|Autograph|Memorabilia|Mega\s*Patch|Young\s*Guns|YG)\b/i.test(
    title
  );
}

/**
 * Signatures imprimées / fac-similés — pas des autos réelles.
 * @param {string} title
 * @returns {boolean}
 */
export function isFakePrintedAutograph(title) {
  const t = title || "";
  if (
    /\b(?:Gold\s+Script|Silver\s+Script|Facsimile|Printed\s+Signature|Stamped|Foil\s+Signature)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (/\bPrinted\b/i.test(t) && /\bSignature\b/i.test(t)) return true;
  if (/\bScript\b/i.test(t)) return true;
  if (/\bIn-Person\b/i.test(t) && !/\b(?:Auto|Autograph)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * @param {string | null | undefined} title
 * @param {"raw" | "graded"} [cardMode]
 * @returns {boolean}
 */
export function shouldExcludeTitle(title, cardMode = CARD_MODE_RAW) {
  if (!title || typeof title !== "string") return true;
  if (TITLE_EXCLUDE_RE.test(title)) return true;
  if (TITLE_EXCLUDE_PICK_LOT_RE.test(title)) return true;
  if (cardMode === CARD_MODE_RAW) return false;
  if (TITLE_EXCLUDE_FAN_OR_BAIT_RE.test(title)) return true;
  if (TITLE_EXCLUDE_NON_CARD_RE.test(title)) return true;
  if (isStandaloneJerseyListing(title)) return true;
  return false;
}

/**
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  if (values.length === 0) return 0;
  const arr = [...values].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 1) return arr[mid];
  return (arr[mid - 1] + arr[mid]) / 2;
}

/**
 * Médiane après retrait du top 15 % et du bottom 2 % (outliers).
 * @param {number[]} values
 * @returns {number}
 */
export function realisticMedian(values) {
  if (values.length === 0) return 0;
  if (values.length < 4) return median(values);

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const trimLow = Math.floor(n * TRIM_LOW_FRACTION);
  const trimHigh = Math.ceil(n * TRIM_HIGH_FRACTION);
  const trimmed = sorted.slice(trimLow, n - trimHigh);
  if (trimmed.length === 0) return median(sorted);
  return median(trimmed);
}

export const AUTO_GROUP_GENERIC = "✍️ Auto / RPA";

/** Groupes fixes avant les sous-groupes ✍️ Auto [produit] (ordre d’affichage) */
export const DEAL_GROUPS_BEFORE_AUTO = [
  "🏆 Gradée PSA",
  "🏆 Gradée BGS/SGC",
  "🔄 Young Guns Renewed",
  "⭐ Young Guns",
];

/** Groupes fixes après Auto (ordre d’affichage) */
export const DEAL_GROUPS_AFTER_AUTO = [
  "🎽 Jersey / Patch",
  "🔢 Numéroté",
  "🎨 Canvas",
  "✨ Clear Cut / Acetate",
  "💎 SPx / Premier / Allure",
  "🌈 Parallèle coloré",
  "📦 Autres cartes",
];

/** @deprecated Utiliser DEAL_GROUPS_BEFORE_AUTO / AFTER_AUTO ; les clés Auto produit sont dynamiques */
export const DEAL_GROUP_ORDER = [
  ...DEAL_GROUPS_BEFORE_AUTO,
  AUTO_GROUP_GENERIC,
  ...DEAL_GROUPS_AFTER_AUTO,
];

/**
 * @param {Record<string, unknown>} buckets
 * @returns {string[]}
 */
function getOrderedGroupKeys(buckets) {
  const keys = Object.keys(buckets);
  const out = [];
  for (const k of DEAL_GROUPS_BEFORE_AUTO) {
    if (keys.includes(k)) out.push(k);
  }
  const autoProductKeys = keys
    .filter((k) => k.startsWith("✍️ Auto ") && k !== AUTO_GROUP_GENERIC)
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  out.push(...autoProductKeys);
  if (keys.includes(AUTO_GROUP_GENERIC)) out.push(AUTO_GROUP_GENERIC);
  for (const k of DEAL_GROUPS_AFTER_AUTO) {
    if (keys.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Auto / RPA réel : mot-clé explicite, sans script ni fac-similé imprimé.
 * @param {string} t
 * @returns {boolean}
 */
function matchesAutoSignature(t) {
  if (isFakePrintedAutograph(t)) return false;
  return (
    /\bAutographs?\b/i.test(t) ||
    /\bAutograph\b/i.test(t) ||
    /\bSigned\b/i.test(t) ||
    /\bRPA\b/i.test(t) ||
    /\bAuto\b/i.test(t)
  );
}

/**
 * Premier produit détecté dans le titre (ordre = sous-chaînes les plus spécifiques d’abord).
 * @param {string} t
 * @returns {string | null} libellé produit pour la clé de groupe
 */
function detectAutoProductLabel(t) {
  /** @type {{ label: string; re: RegExp }[]} */
  const products = [
    { label: "The Cup", re: /\bThe\s+Cup\b/i },
    { label: "Black Diamond", re: /\bBlack\s+Diamond\b/i },
    { label: "Exquisite", re: /\bExquisite\b/i },
    { label: "Dominion", re: /\bDominion\b/i },
    { label: "Clear Cut", re: /\bClear\s+Cut\b/i },
    { label: "Series 2", re: /\bSeries\s*2\b/i },
    { label: "Series 1", re: /\bSeries\s*1\b/i },
    { label: "Extended", re: /\bExtended\b/i },
    { label: "MVP", re: /\bMVP\b/i },
    { label: "Exclusives", re: /\bExclusives\b/i },
    { label: "Artifacts", re: /\bArtifacts\b/i },
    { label: "Credentials", re: /\bCredentials\b/i },
    { label: "Trilogy", re: /\bTrilogy\b/i },
    { label: "Premier", re: /\bPremier\b/i },
    { label: "Allure", re: /\bAllure\b/i },
    { label: "SPx", re: /\bSPx\b|\bSPX\b/i },
  ];
  for (const { label, re } of products) {
    if (re.test(t)) return label;
  }
  return null;
}

/**
 * @param {string} title
 * @returns {string | null} clé de groupe ou null si non classé (ignoré)
 */
export function detectCardGroup(title) {
  const t = title || "";

  if (/\bPSA\b/i.test(t)) {
    return "🏆 Gradée PSA";
  }
  if (/\bBGS\b/i.test(t) || /\bSGC\b/i.test(t)) {
    return "🏆 Gradée BGS/SGC";
  }
  const ygRenewed =
    /\bYoung\s*Guns\s+Renewed\b/i.test(t) ||
    /\bYG\s+Renewed\b/i.test(t) ||
    (/\bRenewed\b/i.test(t) &&
      (/\bYoung\s*Guns\b/i.test(t) || /\bYG\b/i.test(t)));
  if (ygRenewed) {
    return "🔄 Young Guns Renewed";
  }
  if (
    /\bYoung\s*Guns\b/i.test(t) ||
    /\bYG\b/i.test(t) ||
    /\b1st\s+Round\s+Rookie\b/i.test(t)
  ) {
    return "⭐ Young Guns";
  }
  if (matchesAutoSignature(t)) {
    const prod = detectAutoProductLabel(t);
    return prod ? `✍️ Auto ${prod}` : AUTO_GROUP_GENERIC;
  }
  if (
    /\bJersey\b/i.test(t) ||
    /\bPatch\b/i.test(t) ||
    /\bRelic\b/i.test(t) ||
    /\bSwatch\b/i.test(t) ||
    /\bMemorabilia\b/i.test(t) ||
    /\bMega\s*Patch\b/i.test(t)
  ) {
    return "🎽 Jersey / Patch";
  }
  if (
    /\/\s*(99|50|25|10|5|1)\b/i.test(t) ||
    /\/(99|50|25|10|5|1)\b/i.test(t) ||
    /\bnumbered\b/i.test(t) ||
    /#['']?\s*d\b/i.test(t) ||
    /#\/d\b/i.test(t)
  ) {
    return "🔢 Numéroté";
  }
  if (/\bUD\s*Canvas\b/i.test(t) || /\bCanvas\b/i.test(t)) {
    return "🎨 Canvas";
  }
  if (/\bClear\s*Cut\b/i.test(t) || /\bAcetate\b/i.test(t) || /\bRetro\b/i.test(t)) {
    return "✨ Clear Cut / Acetate";
  }
  if (
    /\bSPx\b/i.test(t) ||
    /\bSPX\b/i.test(t) ||
    /\bPremier\b/i.test(t) ||
    /\bAllure\b/i.test(t) ||
    /\bCredentials\b/i.test(t) ||
    /\bTrilogy\b/i.test(t) ||
    /\bExclusives\b/i.test(t)
  ) {
    return "💎 SPx / Premier / Allure";
  }
  if (
    /\bGold\b/i.test(t) ||
    /\bSilver\b/i.test(t) ||
    /\bRuby\b/i.test(t) ||
    /\bSapphire\b/i.test(t) ||
    /\bEmerald\b/i.test(t) ||
    /\bAmethyst\b/i.test(t) ||
    /\bRainbow\b/i.test(t) ||
    /\bOutburst\b/i.test(t) ||
    /\bHigh\s*Gloss\b/i.test(t) ||
    /\bDazzlers\b/i.test(t) ||
    /\bPrinting\s*Plate\b/i.test(t) ||
    /\bBlack\s+and\s+White\b/i.test(t)
  ) {
    return "🌈 Parallèle coloré";
  }

  return null;
}

/**
 * @param {object} item — eBay item summary
 * @returns {{ title: string; priceCad: number; url: string | null; imageUrl: string | null } | null}
 */
function mapRawListing(item) {
  const title = typeof item?.title === "string" ? item.title : "";
  const v = item?.price?.value;
  const cur = item?.price?.currency;
  const priceCad = listingPriceToCad(v, cur);
  if (priceCad == null) return null;
  const imageUrl =
    item?.image?.imageUrl ??
    item?.thumbnailImages?.[0]?.imageUrl ??
    null;
  const url = typeof item?.itemWebUrl === "string" ? item.itemWebUrl : null;
  return { title, priceCad, url, imageUrl };
}

/**
 * @param {string} playerName
 * @param {string} token
 * @param {string} marketplaceId
 * @returns {Promise<{ ok: true; listings: Array<{ title: string; priceCad: number; url: string | null; imageUrl: string | null }>; totalListings: number } | { ok: false; error: string; detail?: string; status?: number }>}
 */
export async function fetchEbayHockeyCardListingsForPlayer(
  playerName,
  token,
  marketplaceId
) {
  const name = playerName?.trim();
  if (!name) {
    return { ok: false, error: "Nom joueur vide", status: 400 };
  }

  const ebayUrl = new URL(EBAY_BROWSE_SEARCH);
  ebayUrl.searchParams.set("q", `${name} hockey card`);
  ebayUrl.searchParams.set("limit", String(EBAY_LISTINGS_LIMIT));

  let upstream;
  try {
    upstream = await fetch(ebayUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: "Impossible de joindre l’API eBay",
      detail: String(err?.message ?? err),
      status: 502,
    };
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return {
      ok: false,
      error: "Réponse eBay invalide",
      detail: text.slice(0, 400),
      status: 502,
    };
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return { ok: false, error: "Réponse eBay non JSON", status: 502 };
  }

  const summaries = Array.isArray(data.itemSummaries)
    ? data.itemSummaries
    : [];
  const totalListings = summaries.length;

  const listings = [];
  for (const item of summaries) {
    const mapped = mapRawListing(item);
    if (!mapped) continue;
    if (shouldExcludeTitle(mapped.title, CARD_MODE_RAW)) continue;
    listings.push(mapped);
  }

  return { ok: true, listings, totalListings };
}

/**
 * Médiane eBay (raw, filtrée) et nombre total d'annonces pour un joueur.
 * Priorité : cartes ⭐ Young Guns ; sinon médiane sur toutes les cartes raw.
 * @param {string} playerName
 * @returns {Promise<{ medianPriceCad: number | null; listingCount: number | null; priceSource: "young_guns" | "all_raw" | null }>}
 */
export async function getEbayMedianAndCountForPlayer(playerName) {
  const empty = {
    medianPriceCad: null,
    listingCount: null,
    priceSource: null,
  };

  const name = String(playerName ?? "").trim();
  if (!name) {
    return empty;
  }

  const token = await resolveEbayBearerToken();
  if (!token) {
    return empty;
  }

  const marketplaceId =
    process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const ebay = await fetchEbayHockeyCardListingsForPlayer(
    name,
    token,
    marketplaceId
  );
  if (!ebay.ok || !Array.isArray(ebay.listings)) {
    return empty;
  }

  const listingCount =
    typeof ebay.totalListings === "number"
      ? ebay.totalListings
      : ebay.listings.length;

  const ygPrices = ebay.listings
    .filter((l) => detectCardGroup(l.title) === "⭐ Young Guns")
    .map((l) => l.priceCad)
    .filter((p) => Number.isFinite(p) && p > 0);

  if (ygPrices.length > 0) {
    return {
      medianPriceCad: Math.round(realisticMedian(ygPrices) * 100) / 100,
      listingCount,
      priceSource: "young_guns",
    };
  }

  const allRawPrices = ebay.listings
    .map((l) => l.priceCad)
    .filter((p) => Number.isFinite(p) && p > 0);

  if (allRawPrices.length > 0) {
    return {
      medianPriceCad: Math.round(realisticMedian(allRawPrices) * 100) / 100,
      listingCount,
      priceSource: "all_raw",
    };
  }

  return { medianPriceCad: null, listingCount, priceSource: null };
}

/**
 * @param {string} cardType
 */
function cardTypeDisplayName(cardType) {
  return String(cardType)
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/**
 * @param {{ cardType: string; cardCode: string | null; printRun: string | null; grade: string | null }} fp
 */
function fingerprintDisplayName(fp) {
  const parts = [];
  if (fp.grade) parts.push(fp.grade);
  parts.push(cardTypeDisplayName(fp.cardType));
  if (fp.cardCode) parts.push(`#${fp.cardCode}`);
  else if (fp.printRun) parts.push(fp.printRun);
  return parts.join(" ");
}

/**
 * @param {number} marketPrice
 * @returns {string}
 */
function formatEbayMedianBadge(marketPrice) {
  const rounded = Math.round(marketPrice * 100) / 100;
  return `Prix moyen eBay : ${rounded.toFixed(2)} $`;
}

/**
 * Pipeline médiane + scores (Claude ou heuristique).
 * @param {string} playerName
 * @param {Array<{ title: string; priceCad: number; url: string | null; imageUrl: string | null }>} listings
 * @param {number} totalListingsRaw
 * @param {boolean} mocked — si true, pas d’appel Claude (scores démo / heuristique)
 */
export async function buildInvestmentIntelligenceFromListings(
  playerName,
  listings,
  totalListingsRaw,
  mocked,
  cardMode = CARD_MODE_RAW
) {
  const name = playerName?.trim() || "Joueur";
  const mode = parseCardMode(cardMode);
  const filtered = filterListingsByCardMode(listings, mode);
  const base = await buildInvestmentBasePayload(
    name,
    filtered,
    mocked,
    totalListingsRaw,
    mode
  );

  if (base.listingRows.length === 0) {
    const modeHint =
      mode === CARD_MODE_GRADED
        ? "Aucun deal gradé trouvé (PSA, BGS, SGC…)"
        : "Aucun deal raw trouvé";
    return {
      ok: false,
      error: `${modeHint} : il faut au moins ${MIN_GROUP_LISTINGS} annonces similaires dans un même groupe, avec au moins une annonce 20 % sous la médiane eBay. Essaye un autre joueur ou l'autre mode.`,
      status: 422,
      totalListings: totalListingsRaw,
      validListings: 0,
    };
  }

  const batch = base.listingRows.slice(0, INVESTMENT_SCORE_BATCH_MAX);
  const claudeResult = mocked
    ? { ok: false, scores: [] }
    : await scoreListingsForInvestment(name, batch);
  const claudeUsed = Boolean(
    !mocked && claudeResult.ok && claudeResult.scores?.length > 0
  );
  const scored = attachInvestmentScores(
    base.listingRows,
    claudeResult,
    mocked
  );
  const sortedListings = sortListingsByInvestmentScore(scored);

  return {
    ok: true,
    data: {
      mocked,
      cardMode: mode,
      totalListings: totalListingsRaw,
      validListings: base.validListings,
      listings: sortedListings,
      scoredBatchMax: INVESTMENT_SCORE_BATCH_MAX,
      claudeUsed,
    },
  };
}

/**
 * Clé de bucket incluant le grade en mode gradé (PSA 10 vs PSA 9 séparés).
 * @param {NonNullable<ReturnType<typeof extractCardFingerprint>>} extracted
 * @param {string} title
 * @param {"raw" | "graded"} cardMode
 */
function resolveBucketFingerprint(extracted, title, cardMode) {
  const fp = extracted.fingerprint;
  if (cardMode !== CARD_MODE_GRADED) return fp;

  const m = title.match(
    new RegExp(`\\b(${GRADING_COMPANY_NAMES})\\s*(10|9(?:\\.5)?|8)\\b`, "i")
  );
  if (!m) return fp;

  const gradePart = `${m[1].toLowerCase()}${m[2].replace(".", "")}`;
  if (fp === gradePart || fp.startsWith(`${gradePart}-`)) return fp;
  return `${gradePart}-${fp}`;
}

/**
 * @param {number} marketPrice
 * @param {boolean} reliableFingerprint
 * @returns {{ marketBadge: string; marketBadgeTone: "blue" | "gray" }}
 */
function formatMarketBadge(marketPrice, reliableFingerprint) {
  if (reliableFingerprint) {
    return {
      marketBadge: formatEbayMedianBadge(marketPrice),
      marketBadgeTone: "blue",
    };
  }
  return { marketBadge: "Prix estimé", marketBadgeTone: "gray" };
}

/**
 * Annonces utilisées pour la médiane (raw seulement, ou même grade en mode gradé).
 * @param {Array<{ title: string; priceCad: number }>} bucket
 * @param {"raw" | "graded"} cardMode
 * @param {string | null} [gradeKey]
 */
function rowsForMedianCalculation(bucket, cardMode, gradeKey = null) {
  if (cardMode === CARD_MODE_RAW) {
    return bucket.filter((r) => !hasGradingIndicatorInTitle(r.title));
  }
  if (gradeKey) {
    return bucket.filter((r) => extractGradeKey(r.title) === gradeKey);
  }
  return bucket.filter((r) => isGradedListing(r.title));
}

/**
 * Pool d'annonces éligibles aux deals affichés (même filtre que la médiane).
 * @param {Array<{ title: string; priceCad: number }>} bucket
 * @param {"raw" | "graded"} cardMode
 * @param {string | null} [gradeKey]
 */
function rowsForDealPool(bucket, cardMode, gradeKey = null) {
  return rowsForMedianCalculation(bucket, cardMode, gradeKey);
}

/**
 * Médiane trimmée (sans outliers) ; deals sous seuil mode (raw 20 %, gradé 3 %).
 * @param {Array<{ title: string; priceCad: number; url: string | null; imageUrl: string | null }>} bucket
 * @param {string} type
 * @param {{ cardNumber?: string | null; groupDisplayName?: string; reliableFingerprint?: boolean; cardMode?: "raw" | "graded"; gradeKey?: string | null }} [meta]
 */
function summarizeGroupDeals(bucket, type, meta = {}) {
  if (bucket.length < MIN_GROUP_LISTINGS) return null;

  const cardMode = parseCardMode(meta.cardMode);
  const gradeKey = meta.gradeKey ?? null;
  const medianRows = rowsForMedianCalculation(bucket, cardMode, gradeKey);

  if (medianRows.length === 0) return null;

  const canShowEbayMedian = medianRows.length >= MIN_GROUP_LISTINGS;
  const medianPrices = medianRows.map((r) => r.priceCad);
  const marketPrice = canShowEbayMedian
    ? Math.round(realisticMedian(medianPrices) * 100) / 100
    : Math.round(median(medianPrices) * 100) / 100;
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) return null;

  const reliableForBadge =
    meta.reliableFingerprint === true && canShowEbayMedian;

  const dealPool = rowsForDealPool(bucket, cardMode, gradeKey);
  const dealThreshold =
    marketPrice *
    (cardMode === CARD_MODE_GRADED
      ? DEAL_BELOW_MEDIAN_RATIO_GRADED
      : DEAL_BELOW_MEDIAN_RATIO);
  let dealRows = dealPool.filter((row) => row.priceCad <= dealThreshold);
  let bestAvailable = false;

  if (dealRows.length === 0) {
    if (cardMode === CARD_MODE_GRADED && dealPool.length > 0) {
      dealRows = [
        dealPool.reduce((min, row) =>
          row.priceCad < min.priceCad ? row : min
        ),
      ];
      bestAvailable = true;
    } else {
      return null;
    }
  }

  const { marketBadge, marketBadgeTone } = formatMarketBadge(
    marketPrice,
    reliableForBadge
  );
  const listings = dealRows.map((row) => ({
    title: row.title,
    price: row.priceCad,
    percentOfMarket:
      marketPrice > 0
        ? Math.round((row.priceCad / marketPrice) * 1000) / 10
        : 0,
    url: row.url,
    imageUrl: row.imageUrl,
    groupType: type,
    groupDisplayName: meta.groupDisplayName ?? type,
    cardNumber: meta.cardNumber ?? null,
    marketPrice,
    priceConfidence: "medium",
    marketBadge,
    marketBadgeTone,
    ...(bestAvailable ? { bestAvailable: true } : {}),
  }));

  return {
    type,
    groupDisplayName: meta.groupDisplayName ?? type,
    cardNumber: meta.cardNumber ?? null,
    marketPrice,
    listingCount: dealRows.length,
    priceConfidence: "medium",
    listings,
  };
}

/**
 * @param {Array<{ title: string; priceCad: number; url: string | null; imageUrl: string | null }>} listings
 * @param {boolean} mocked
 * @param {number} totalListingsRaw
 */
async function buildInvestmentBasePayload(
  playerName,
  listings,
  mocked,
  totalListingsRaw,
  cardMode = CARD_MODE_RAW
) {
  void playerName;
  void mocked;
  const mode = parseCardMode(cardMode);
  const eligible = listings.filter(
    (row) => !shouldExcludeTitle(row.title, mode)
  );
  /** @type {Record<string, Array<{ row: typeof listings[number]; type: string; fingerprint: ReturnType<typeof extractCardFingerprint> }>>} */
  const cardBuckets = {};
  /** @type {Record<string, typeof listings>} */
  const typeBuckets = {};

  for (const row of eligible) {
    const type = detectCardGroup(row.title);
    const extracted = extractCardFingerprint(row.title);
    if (extracted?.fingerprint) {
      if (
        mode !== CARD_MODE_RAW &&
        extracted.cardType === "auto" &&
        isFakePrintedAutograph(row.title)
      ) {
        continue;
      }
      const bucketKey = resolveBucketFingerprint(extracted, row.title, mode);
      if (!cardBuckets[bucketKey]) cardBuckets[bucketKey] = [];
      cardBuckets[bucketKey].push({
        row,
        type: type ?? cardTypeDisplayName(extracted.cardType),
        fingerprint: extracted,
      });
      continue;
    }

    if (!type) {
      if (mode === CARD_MODE_RAW) {
        const fallback = "📦 Autres cartes";
        if (!typeBuckets[fallback]) typeBuckets[fallback] = [];
        typeBuckets[fallback].push(row);
      }
      continue;
    }
    if (!typeBuckets[type]) typeBuckets[type] = [];
    typeBuckets[type].push(row);
  }

  const groupSummaries = [];

  for (const [fingerprint, entries] of Object.entries(cardBuckets)) {
    const bucket = entries.map((e) => e.row);
    const type = entries[0]?.type ?? "Carte";
    const fp = entries[0]?.fingerprint;
    const cardCode = fp?.cardCode ?? null;
    const groupDisplayName = fp ? fingerprintDisplayName(fp) : fingerprint;
    const gradeKey =
      mode === CARD_MODE_GRADED
        ? extractGradeKey(entries[0]?.row.title ?? "") ??
          extractGradeKeyFromBucketKey(fingerprint)
        : null;
    const built = summarizeGroupDeals(bucket, type, {
      cardNumber: cardCode ?? fp?.printRun ?? fp?.grade ?? fingerprint,
      groupDisplayName,
      reliableFingerprint: Boolean(fp?.cardCode || fp?.printRun),
      cardMode: mode,
      gradeKey,
    });
    if (built) groupSummaries.push(built);
  }

  for (const type of getOrderedGroupKeys(typeBuckets)) {
    const bucket = typeBuckets[type];
    if (!bucket?.length) continue;
    const built = summarizeGroupDeals(bucket, type, {
      reliableFingerprint: false,
      cardMode: mode,
      gradeKey:
        mode === CARD_MODE_GRADED
          ? extractGradeKey(bucket[0]?.title ?? "")
          : null,
    });
    if (built) groupSummaries.push(built);
  }

  /** @type {Array<{ listingIndex: number; title: string; price: number; percentOfMarket: number; url: string | null; imageUrl: string | null; groupType: string; marketPrice: number }>} */
  const flat = [];
  let idx = 0;
  for (const g of groupSummaries) {
    for (const row of g.listings) {
      flat.push({ listingIndex: idx++, ...row });
    }
  }

  return {
    mocked,
    totalListings: totalListingsRaw,
    validListings: flat.length,
    listingRows: flat,
  };
}

/**
 * @param {Array<{ listingIndex: number; title: string; price: number; percentOfMarket: number; url: string | null; imageUrl: string | null; groupType: string; marketPrice: number }>} flat
 * @param {{ ok: boolean; scores?: Array<{ listingIndex: number; investmentScore: number; holdTimeline: string; upside: string; verdict: string; reason: string }> }} claudeResult
 * @param {boolean} forceDemoHeuristic
 */
function attachInvestmentScores(flat, claudeResult, forceDemoHeuristic) {
  const heuristicAll = mockInvestmentScores(flat);
  const heuristicByIdx = new Map(
    heuristicAll.map((h) => [h.listingIndex, h])
  );

  if (forceDemoHeuristic || !claudeResult.ok || !claudeResult.scores?.length) {
    return flat.map((L) => {
      const h = heuristicByIdx.get(L.listingIndex);
      return {
        ...L,
        investmentScore: h?.investmentScore ?? 5,
        holdTimeline: h?.holdTimeline ?? "—",
        upside: h?.upside ?? "Moyen",
        verdict: h?.verdict ?? "Surveiller",
        reason: h?.reason ?? "—",
        scoreSource: forceDemoHeuristic ? "demo" : "heuristic",
      };
    });
  }

  const claudeByIdx = new Map(
    claudeResult.scores.map((s) => [s.listingIndex, s])
  );

  return flat.map((L) => {
    const useClaude =
      L.listingIndex < INVESTMENT_SCORE_BATCH_MAX &&
      claudeByIdx.has(L.listingIndex);
    const s = useClaude
      ? claudeByIdx.get(L.listingIndex)
      : heuristicByIdx.get(L.listingIndex);
    return {
      ...L,
      investmentScore: s?.investmentScore ?? 5,
      holdTimeline: s?.holdTimeline ?? "—",
      upside: s?.upside ?? "Moyen",
      verdict: s?.verdict ?? "Surveiller",
      reason: s?.reason ?? "—",
      scoreSource: useClaude ? "claude" : "heuristic",
    };
  });
}

function sortListingsByInvestmentScore(listings) {
  return [...listings].sort((a, b) => {
    const ds = b.investmentScore - a.investmentScore;
    if (ds !== 0) return ds;
    return a.percentOfMarket - b.percentOfMarket;
  });
}

/**
 * @param {string} playerName
 */
async function buildMockInvestmentIntelligence(
  playerName,
  cardMode = CARD_MODE_RAW
) {
  const name = (playerName && playerName.trim()) || "Joueur NHL";
  const mode = parseCardMode(cardMode);
  const allListings = [
    { title: `${name} Young Guns #201 PSA 9 Mint`, priceCad: 310, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Young Guns #201 PSA 10 Gem Mint`, priceCad: 420, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} ICE RC PSA 10 Low Pop`, priceCad: 285, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} The Cup RPA BGS 9`, priceCad: 890, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Future Watch BGS 9.5 Gold Label`, priceCad: 220, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Credentials SGC 9.5`, priceCad: 95, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Acetate Highlights SGC 10`, priceCad: 140, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Upper Deck Series 2 Young Guns #201`, priceCad: 88, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Young Guns Renewed OPC Platinum`, priceCad: 92, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} YG Renewed Rookie Choice`, priceCad: 98, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} YG 1st Round Rookie Choice #201`, priceCad: 105, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Young Guns High Series #201`, priceCad: 72, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} SP Authentic Ink Signed`, priceCad: 165, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Upper Deck SP Authentic Future Watch Ink`, priceCad: 172, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Trilogy Auto Autograph`, priceCad: 142, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Upper Deck Trilogy Rookie Auto`, priceCad: 148, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} The Cup RPA Auto Patch RC`, priceCad: 780, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} The Cup Auto Signed Rookie`, priceCad: 820, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} The Cup Mega Patch Jersey Relic`, priceCad: 520, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Ultimate Memorabilia Swatch Patch`, priceCad: 180, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} OPC Platinum Marquee /25`, priceCad: 48, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} UD Portfolio Hockey /99`, priceCad: 22, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} UD Canvas Phenoms #C197`, priceCad: 55, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Canvas Portrait RC #C197`, priceCad: 62, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Clear Cut Phenoms Acetate`, priceCad: 195, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} UD Clear Cut Retro`, priceCad: 168, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} SP Authentic Trilogy Rookie`, priceCad: 125, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Premier Hockey Credentials`, priceCad: 38, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} OPC Rainbow Gold Marquee #C197`, priceCad: 42, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Select Silver Prizm Parallel`, priceCad: 28, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} Allure Exclusives Ruby`, priceCad: 55, url: "https://www.ebay.ca", imageUrl: null },
    { title: `${name} ICE SPX Spectrum`, priceCad: 108, url: "https://www.ebay.ca", imageUrl: null },
  ];
  const listings = filterListingsByCardMode(allListings, mode);

  const base = await buildInvestmentBasePayload(name, listings, true, 100, mode);
  const scored = attachInvestmentScores(
    base.listingRows,
    { ok: false, scores: [] },
    true
  );
  return {
    mocked: true,
    cardMode: mode,
    totalListings: 100,
    validListings: base.validListings,
    listings: sortListingsByInvestmentScore(scored),
    scoredBatchMax: INVESTMENT_SCORE_BATCH_MAX,
    claudeUsed: false,
  };
}

/**
 * @param {string} playerName
 * @param {"raw" | "graded"} [cardMode]
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<{ ok: true; data: object } | { ok: false; error: string; status?: number; totalListings?: number; validListings?: number }>}
 */
export async function getDealFinderResult(
  playerName,
  cardMode = CARD_MODE_RAW,
  options = {}
) {
  const name = playerName?.trim();
  if (!name) {
    return { ok: false, error: "Paramètre requis : player", status: 400 };
  }

  const mode = parseCardMode(cardMode);
  const forceRefresh = Boolean(options.forceRefresh);

  const caufieldCached = await readCaufieldDealCache(name, mode, options);
  if (caufieldCached) {
    return caufieldCached;
  }

  const cacheKey = `${name.toLowerCase()}:${mode}`;
  if (!forceRefresh) {
    const cached = playerResultCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < PLAYER_RESULT_CACHE_TTL_MS) {
      return cached.result;
    }
  }

  const token = await resolveEbayBearerToken();
  if (!token) {
    const mockData = await buildMockInvestmentIntelligence(name, mode);
    if (!mockData.listings?.length) {
      const empty = await buildInvestmentIntelligenceFromListings(
        name,
        [],
        100,
        true,
        mode
      );
      if (!empty.ok) {
        return {
          ok: false,
          error: empty.error,
          status: empty.status ?? 422,
          totalListings: empty.totalListings,
          validListings: empty.validListings ?? 0,
        };
      }
    }
    const result = { ok: true, data: mockData };
    playerResultCache.set(cacheKey, { fetchedAt: Date.now(), result });
    if (isCaufieldDealCacheTarget(name, mode)) {
      await persistCaufieldDealCache(result);
    }
    return result;
  }

  const marketplaceId =
    process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const ebay = await fetchEbayHockeyCardListingsForPlayer(
    name,
    token,
    marketplaceId
  );
  if (!ebay.ok) {
    return {
      ok: false,
      error: ebay.error,
      ...(ebay.detail ? { detail: ebay.detail } : {}),
      status: ebay.status ?? 502,
    };
  }

  const intel = await buildInvestmentIntelligenceFromListings(
    name,
    ebay.listings,
    ebay.totalListings,
    false,
    mode
  );
  if (!intel.ok) {
    return {
      ok: false,
      error: intel.error,
      status: intel.status ?? 422,
      totalListings: intel.totalListings,
      validListings: intel.validListings ?? 0,
    };
  }

  const result = { ok: true, data: intel.data };
  playerResultCache.set(cacheKey, { fetchedAt: Date.now(), result });
  if (isCaufieldDealCacheTarget(name, mode)) {
    await persistCaufieldDealCache(result);
  }
  return result;
}
