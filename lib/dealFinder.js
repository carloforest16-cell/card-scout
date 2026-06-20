import "server-only";

import { createClient } from "@supabase/supabase-js";

import { toAffiliateUrl } from "@/lib/ebayAffiliate";

import {
  INVESTMENT_SCORE_BATCH_MAX,
  mockInvestmentScores,
  scoreListingsForInvestment,
} from "@/lib/dealInvestmentScore";
import { listingPriceToCad, resolveEbayBearerToken } from "@/lib/ebayServer";
import { ageYearsFromBirthDate, buildScorePayloadFromLanding } from "@/lib/cardScoutScore";

const NHL_PLAYER_SEARCH = "https://search.d3.nhle.com/api/v1/search/player";
const NHL_LANDING_BASE = "https://api-web.nhle.com/v1/player";

const EBAY_BROWSE_SEARCH =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EBAY_LISTINGS_LIMIT = 200; // max eBay Browse — densifie les cohortes de juste-valeur
const MIN_DEAL_PRICE_CAD = 10;
const MIN_DISPLAY_INVESTMENT_SCORE = 5.0;
const TRIM_LOW_FRACTION = 0.02;
const TRIM_HIGH_FRACTION = 0.15;
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

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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
async function readCaufieldDealCacheFromSupabase() {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("cache_generic")
      .select("payload, fetched_at")
      .eq("key", CAUFIELD_BLOB_CACHE_PATHNAME)
      .single();
    if (!data?.payload) return null;
    const fetchedAt = new Date(data.fetched_at).getTime();
    if (!isCaufieldCacheEntryFresh(fetchedAt)) return null;
    return { fetchedAt, result: data.payload };
  } catch {
    return null;
  }
}

/**
 * @param {{ fetchedAt: number; result: object }} entry
 */
async function writeCaufieldDealCacheToSupabase(entry) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from("cache_generic").upsert(
      {
        key: CAUFIELD_BLOB_CACHE_PATHNAME,
        fetched_at: new Date(entry.fetchedAt).toISOString(),
        payload: entry.result,
      },
      { onConflict: "key" }
    );
  } catch (err) {
    console.error(
      "[dealFinder] Échec écriture supabase Caufield:",
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
  await writeCaufieldDealCacheToSupabase(entry);
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

  const blobEntry = await readCaufieldDealCacheFromSupabase();
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
  /\b(?:You\s+Pick|U\s+Pick|Your\s+Choice|You\s+Choose|Choose|Lot\s+of|Bundle|Collection|Set\s+of|Pack\s+of|Mystery|Wholesale|Pick\s+From\s+List|From\s+List|U-Pick|Scoring\s+Power\s+Pick|Power\s+Pick|Pick\s+Your|Select\s+Your|Choose\s+Your|Pick\s+a\s+Card|Pick\s+A\s+Card|Multi|Lot\b|#\d+-\d+)\b|~|\*\*\*/i;

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
  const basePriceCad = listingPriceToCad(v, cur);
  if (basePriceCad == null) return null;

  // Inclure les frais de port → on compare des COÛTS TOTAUX. Un item à 8$ + 20$
  // de port n'est pas un meilleur deal qu'un item à 28$ port gratuit.
  let shipCad = 0;
  const opt = Array.isArray(item?.shippingOptions) ? item.shippingOptions[0] : null;
  const shipVal = opt?.shippingCost?.value;
  if (shipVal != null) {
    const s = listingPriceToCad(shipVal, opt?.shippingCost?.currency ?? cur);
    if (s != null) shipCad = s; // listingPriceToCad renvoie null si <= 0 (port gratuit)
  }
  const priceCad = Math.round((basePriceCad + shipCad) * 100) / 100;

  const imageUrl =
    item?.image?.imageUrl ??
    item?.thumbnailImages?.[0]?.imageUrl ??
    null;
  const url = toAffiliateUrl(item?.itemWebUrl) ?? null;
  return { title, priceCad, shippingCad: shipCad, url, imageUrl };
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

const FAIR_VALUE_SHOW_COMPS = 2; // afficher un estimé (étiqueté « indicatif »)
const FAIR_VALUE_TRUST_COMPS = 4; // assez fiable pour nourrir le score

/**
 * Clé de cohorte d'une carte : groupe (detectCardGroup, qui sépare déjà
 * grades / parallèles) + millésime + tirage. Deux annonces partageant cette clé
 * sont la MÊME carte ; on ne compare jamais entre clés différentes.
 * @param {string | null | undefined} title
 * @returns {string | null}
 */
export function cohortKeyForTitle(title) {
  const group = detectCardGroup(title);
  if (!group) return null;
  const t = String(title ?? "");
  const ym = t.match(/\b(20\d{2})\b/);
  const pr = t.match(/\/\d{1,4}\b/);
  return `${group}|${ym ? ym[1] : "?"}|${pr ? pr[0] : ""}`;
}

/**
 * Juste-valeur par empreinte de carte : on ne compare JAMAIS entre variantes.
 * Chaque carte exacte (même année + set + parallèle + grade) forme une cohorte ;
 * sa médiane robuste = sa juste-valeur. Cohorte trop maigre → on s'abstient.
 * @param {Array<{ title?: string; priceCad?: number }>} listings
 * @returns {Map<string, { fairValueCad: number | null; comps: number; confidence: string; grade: string | null; cardType: string | null; year: string | null }>}
 */
export function computeFairValueByFingerprint(listings) {
  /** @type {Map<string, { prices: number[]; grade: string|null; cardType: string|null; year: string|null }>} */
  const cohorts = new Map();
  for (const l of Array.isArray(listings) ? listings : []) {
    const price = Number(l?.priceCad ?? l?.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const key = cohortKeyForTitle(l?.title);
    if (!key) continue;
    const [cardType, year] = key.split("|");
    let c = cohorts.get(key);
    if (!c) {
      c = { prices: [], cardType, year };
      cohorts.set(key, c);
    }
    c.prices.push(price);
  }

  const result = new Map();
  for (const [key, c] of cohorts) {
    const comps = c.prices.length;
    const meta = { cardType: c.cardType, year: c.year };
    if (comps < FAIR_VALUE_SHOW_COMPS) {
      result.set(key, { fairValueCad: null, minPriceCad: null, comps, confidence: "insufficient", ...meta });
      continue;
    }
    const sorted = [...c.prices].sort((a, b) => a - b);
    const spread = sorted[sorted.length - 1] / Math.max(sorted[0], 0.01);
    let confidence;
    if (comps >= 8 && spread <= 6) confidence = "high";
    else if (comps >= 5) confidence = "medium";
    else if (comps >= FAIR_VALUE_TRUST_COMPS) confidence = "low";
    else confidence = "indicative"; // 2-3 comps : estimé approximatif
    result.set(key, {
      fairValueCad: Math.round(realisticMedian(c.prices) * 100) / 100,
      minPriceCad: Math.round(sorted[0] * 100) / 100,
      comps,
      confidence,
      ...meta,
    });
  }
  return result;
}

/**
 * Annote chaque annonce de sa juste-valeur de cohorte + l'écart au prix demandé.
 * dealDeltaPct négatif = sous la juste-valeur = bon deal.
 * @param {Array<{ title?: string; priceCad?: number }>} listings
 */
export function annotateListingsWithFairValue(listings) {
  const fairMap = computeFairValueByFingerprint(listings);
  return (Array.isArray(listings) ? listings : []).map((l) => {
    const price = Number(l?.priceCad ?? l?.price);
    const key = cohortKeyForTitle(l?.title);
    const fv = key ? fairMap.get(key) : null;
    if (!fv || fv.fairValueCad == null || !Number.isFinite(price) || price <= 0) {
      return {
        ...l,
        fairValueCad: fv?.fairValueCad ?? null,
        dealDeltaPct: null,
        fairValueConfidence: fv?.confidence ?? "insufficient",
      };
    }
    return {
      ...l,
      fairValueCad: fv.fairValueCad,
      dealDeltaPct: Math.round(((price - fv.fairValueCad) / fv.fairValueCad) * 100),
      fairValueConfidence: fv.confidence,
    };
  });
}

/**
 * Médiane eBay et nombre total d'annonces pour un joueur.
 * Priorité : cartes ⭐ Young Guns ; sinon cohorte d'empreinte la plus liquide
 * (et non plus une médiane mélangeant toutes les variantes).
 * @param {string} playerName
 * @returns {Promise<{ medianPriceCad: number | null; listingCount: number | null; priceSource: string | null; cohorts?: Array<object> }>}
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

  // Cohortes d'empreinte (jamais de mélange entre variantes).
  const fairMap = computeFairValueByFingerprint(ebay.listings);
  const cohorts = [...fairMap.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.comps - a.comps);
  const qualified = cohorts.filter((c) => c.fairValueCad != null);

  // Meilleure opportunité : carte dispo le plus en dessous de sa juste-valeur
  // de cohorte (écart % le plus négatif). Signal d'achat précis par carte.
  let dealGapPct = null;
  for (const c of qualified) {
    if (c.fairValueCad > 0 && c.minPriceCad != null && c.comps >= FAIR_VALUE_TRUST_COMPS) {
      const delta = Math.round(((c.minPriceCad - c.fairValueCad) / c.fairValueCad) * 100);
      if (dealGapPct == null || delta < dealGapPct) dealGapPct = delta;
    }
  }

  // Young Guns = carte recrue canonique sur laquelle les collectionneurs cotent.
  const ygPrices = ebay.listings
    .filter((l) => detectCardGroup(l.title) === "⭐ Young Guns")
    .map((l) => l.priceCad)
    .filter((p) => Number.isFinite(p) && p > 0);

  if (ygPrices.length > 0) {
    return {
      medianPriceCad: Math.round(realisticMedian(ygPrices) * 100) / 100,
      listingCount,
      priceSource: "young_guns",
      dealGapPct,
      cohorts,
    };
  }

  // Plus de fallback "médiane sur tout" : on prend la cohorte la plus liquide.
  if (qualified.length > 0) {
    return {
      medianPriceCad: qualified[0].fairValueCad,
      listingCount,
      priceSource: "fingerprint_cohort",
      dealGapPct,
      cohorts,
    };
  }

  return { medianPriceCad: null, listingCount, priceSource: null, dealGapPct, cohorts: [] };
}

/**
 * Pipeline annonces actives + scores (Claude ou heuristique).
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
  cardMode = CARD_MODE_RAW,
  includeNonBuy = false,
  playerContext = null
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
      error: `${modeHint} : aucune annonce active exploitable après filtrage. Essaye un autre joueur ou l'autre mode.`,
      status: 422,
      totalListings: totalListingsRaw,
      validListings: 0,
    };
  }

  // Juste-valeur par cohorte (set filtré complet) AVANT le scoring, pour que
  // l'heuristique comme Claude disposent de percentOfMarket / dealDeltaPct.
  const fairMap = computeFairValueByFingerprint(filtered);
  const enrichedRows = base.listingRows.map((row) => {
    const key = cohortKeyForTitle(row.title);
    const fv = key ? fairMap.get(key) : null;
    const fairValueCad = fv?.fairValueCad ?? null;
    const comps = fv?.comps ?? 0;
    // Le SIGNAL de deal (% + ranking Hottest) n'est émis que si la cohorte est
    // FIABLE (≥4 comps). 2-3 comps → estimé affiché mais sans clamer "-X%"
    // (sinon un médian bruité fait passer une carte chère pour une aubaine).
    const trusted =
      fairValueCad != null && Number(row.price) > 0 && comps >= FAIR_VALUE_TRUST_COMPS;
    return {
      ...row,
      fairValueCad,
      marketPrice: fairValueCad,
      percentOfMarket: trusted
        ? Math.round((Number(row.price) / fairValueCad) * 100)
        : null,
      dealDeltaPct: trusted
        ? Math.round(((Number(row.price) - fairValueCad) / fairValueCad) * 100)
        : null,
      fairValueConfidence: fv?.confidence ?? "insufficient",
      fairValueComps: comps,
    };
  });

  const batch = enrichedRows.slice(0, INVESTMENT_SCORE_BATCH_MAX);
  const claudeResult = mocked
    ? { ok: false, scores: [] }
    : await scoreListingsForInvestment(name, batch, playerContext);
  const claudeUsed = Boolean(
    !mocked && claudeResult.ok && claudeResult.scores?.length > 0
  );
  const scored = attachInvestmentScores(enrichedRows, claudeResult, mocked);

  const buyListings = scored.filter(
    (row) =>
      String(row.verdict ?? "").toLowerCase().includes("acheter") &&
      Number(row.investmentScore) >= MIN_DISPLAY_INVESTMENT_SCORE
  );

  // Pour l'agrégat Hottest Deals : on garde tout sauf "Passer", trié par score,
  // pour toujours remplir la section (la page joueur reste en Acheter only).
  let display;
  if (includeNonBuy) {
    display = scored
      .filter((row) => !String(row.verdict ?? "").toLowerCase().includes("passer"))
      .sort((a, b) => Number(b.investmentScore) - Number(a.investmentScore));
  } else if (buyListings.length > 0) {
    display = buyListings;
  } else {
    // Fallback 1 : surveiller listings (pas de score minimum)
    const watchListings = scored.filter((row) =>
      String(row.verdict ?? "").toLowerCase().includes("surveiller")
    );
    // Fallback 2 : tout trié par score si encore vide
    display = (watchListings.length > 0 ? watchListings : scored).sort(
      (a, b) => Number(b.investmentScore) - Number(a.investmentScore)
    );
  }

  return {
    ok: true,
    data: {
      mocked,
      cardMode: mode,
      totalListings: totalListingsRaw,
      validListings: display.length,
      listings: display,
      scoredBatchMax: INVESTMENT_SCORE_BATCH_MAX,
      claudeUsed,
    },
  };
}

/**
 * @param {Array<{ title: string; priceCad: number; url: string | null; imageUrl: string | null }>} listings
 * @param {boolean} mocked
 * @param {number} totalListingsRaw
 * @param {"raw" | "graded"} [cardMode]
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
    (row) =>
      !shouldExcludeTitle(row.title, mode) &&
      Number(row.priceCad) >= MIN_DEAL_PRICE_CAD
  );

  /** @type {Record<string, typeof listings>} */
  const typeBuckets = {};

  for (const row of eligible) {
    const type = detectCardGroup(row.title);
    if (!type) continue;
    if (!typeBuckets[type]) typeBuckets[type] = [];
    typeBuckets[type].push(row);
  }

  const selected = [];
  for (const type of getOrderedGroupKeys(typeBuckets)) {
    const bucket = typeBuckets[type];
    if (!bucket?.length) continue;
    const cheapest = bucket.reduce((min, row) =>
      row.priceCad < min.priceCad ? row : min
    );
    selected.push({
      title: cheapest.title,
      price: cheapest.priceCad,
      url: cheapest.url,
      imageUrl: cheapest.imageUrl,
      groupType: type,
      groupDisplayName: type,
    });
  }

  const flat = selected
    .sort((a, b) => a.price - b.price)
    .slice(0, 20)
    .map((row, listingIndex) => ({ listingIndex, ...row }));

  return {
    mocked,
    totalListings: totalListingsRaw,
    validListings: flat.length,
    listingRows: flat,
  };
}

/**
 * @param {Array<{ listingIndex: number; title: string; price: number; url: string | null; imageUrl: string | null; groupType: string; groupDisplayName?: string }>} flat
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
        verdict: h?.verdict ?? "Chercher mieux",
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
      verdict: s?.verdict ?? "Chercher mieux",
      reason: s?.reason ?? "—",
      scoreSource: useClaude ? "claude" : "heuristic",
    };
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
  const buyListings = scored.filter(
    (row) =>
      String(row.verdict ?? "").toLowerCase().includes("acheter") &&
      Number(row.investmentScore) >= MIN_DISPLAY_INVESTMENT_SCORE
  );
  return {
    mocked: true,
    cardMode: mode,
    totalListings: 100,
    validListings: buyListings.length,
    listings: buyListings,
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
/**
 * Fetch les stats clés NHL d'un joueur par son nom pour enrichir le scoring deals.
 * Retourne null si indisponible (dégradation gracieuse).
 * @param {string} playerName
 * @returns {Promise<object|null>}
 */
async function fetchPlayerContextForDeals(playerName) {
  try {
    const searchUrl = new URL(NHL_PLAYER_SEARCH);
    searchUrl.searchParams.set("q", playerName);
    searchUrl.searchParams.set("culture", "fr");
    searchUrl.searchParams.set("limit", "5");

    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Accept: "application/json", "User-Agent": "CardScout/1.0" },
      next: { revalidate: 3600 },
    });
    if (!searchRes.ok) return null;

    const results = await searchRes.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const nameLower = playerName.toLowerCase();
    const match =
      results.find((r) =>
        r.name?.toLowerCase().split(" ").every((w) => nameLower.includes(w))
      ) ?? results[0];

    if (!match?.playerId) return null;

    const landingRes = await fetch(
      `${NHL_LANDING_BASE}/${match.playerId}/landing`,
      {
        headers: { Accept: "application/json", "User-Agent": "CardScout/1.0" },
        next: { revalidate: 3600 },
      }
    );
    if (!landingRes.ok) return null;

    const landing = await landingRes.json();
    const payload = buildScorePayloadFromLanding(match.playerId, landing);

    return {
      ageYears: payload.ageYears,
      position: payload.position,
      teamAbbrev: payload.teamAbbrev,
      nhlSeasons: payload.nhlSeasons,
      draftOverall: payload.draftOverall,
      isRetired: payload.isRetired,
      pointsPerGame: payload.currentSeason?.pointsPerGame ?? null,
      gamesPlayed: payload.currentSeason?.gamesPlayed ?? null,
      goals: payload.currentSeason?.goals ?? null,
      assists: payload.currentSeason?.assists ?? null,
      seasonLabel: payload.currentSeason?.seasonLabel ?? null,
      recentFormPpg: payload.recentForm?.pointsPerGame ?? null,
      playoffs: payload.playoffs
        ? {
            seasonLabel: payload.playoffs.seasonLabel,
            gamesPlayed: payload.playoffs.gamesPlayed,
            points: payload.playoffs.points,
            pointsPerGame: payload.playoffs.pointsPerGame,
            monthsSinceEnd: payload.playoffs.monthsSinceEnd,
          }
        : null,
    };
  } catch {
    return null;
  }
}

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

  const [ebay, playerContext] = await Promise.all([
    fetchEbayHockeyCardListingsForPlayer(name, token, marketplaceId),
    fetchPlayerContextForDeals(name),
  ]);

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
    mode,
    false,
    playerContext
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
