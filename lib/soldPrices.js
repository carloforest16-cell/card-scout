import "server-only";

import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { extractCardFingerprint } from "@/lib/cardNumberExtractor";
import { getUsdToCadRateSync } from "@/lib/fxRate";

const TK = "dc848953a13185261a89";
const BASE_URL = "https://back.130point.com/cards/";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MIN_SOLD_COMPS = 3;
const SOLD_WINDOW_DAYS = 120;

/**
 * Map groupe (emoji inclus) → mots-clés pour 130point
 * @param {string} groupType
 */
function groupTypeToKeywords(groupType) {
  if (groupType.includes("Young Guns Renewed")) return "young guns renewed";
  if (groupType.includes("Young Guns")) return "young guns";
  if (groupType.includes("PSA")) return "PSA";
  if (groupType.includes("BGS") || groupType.includes("SGC")) return "BGS SGC";
  if (groupType.includes("Auto")) return "auto autograph";
  if (groupType.includes("Canvas")) return "canvas";
  if (groupType.includes("Numéroté")) return "numbered";
  if (groupType.includes("Jersey") || groupType.includes("Patch")) return "patch jersey";
  if (groupType.includes("Clear Cut")) return "clear cut acetate";
  if (groupType.includes("SPx") || groupType.includes("Premier") || groupType.includes("Allure")) return "SPx premier";
  if (groupType.includes("The Cup") || groupType.includes("Ultimate")) return "the cup ultimate collection";
  if (groupType.includes("OPC Plat") || groupType.includes("Metal") || groupType.includes("Flair")) return "opc platinum metal universe";
  if (groupType.includes("Parallèle")) return "parallel";
  return "";
}

/**
 * Construit la chaîne de recherche 130point pour une cohorte.
 * Format clé cohorte : "groupType|year|numbering"
 * @param {string} playerName
 * @param {string} cohortKey
 * @returns {string}
 */
function buildQuery(playerName, cohortKey) {
  const [groupType, year, numbering] = cohortKey.split("|");
  const keywords = groupTypeToKeywords(groupType);
  const parts = [playerName.trim()];
  if (year && year !== "?") parts.push(year);
  if (keywords) parts.push(keywords);
  if (numbering) parts.push(numbering);
  return parts.join(" ");
}

/**
 * Parse le HTML 130point et retourne les ventes CAD (prix + date ISO + titre)
 * après cutoffMs. Le titre permet de post-filtrer les ventes par fingerprint
 * (élimine les parallèles/grades qui polluent les médianes).
 * @param {string} html
 * @param {number} cutoffMs
 * @returns {Array<{ priceCad: number; date: string; title: string }>}
 */
function parseSoldPrices(html, cutoffMs) {
  const sales = [];
  const usdToCad = getUsdToCadRateSync();

  // Regex unique par row : capture price, currency, titre eBay, date dans
  // l'ordre où ils apparaissent dans le HTML 130point. Sans cette approche,
  // un row sans titre/date faussait l'alignement avec une simple matchAll.
  const rowRe =
    /<tr\s+id="dRow"[^>]*data-price="([\d.]+)"[^>]*data-currency="(USD|CAD)"[\s\S]*?<span\s+id=['"]titleText['"]>\s*<a[^>]*>([^<]*)<\/a>[\s\S]*?Date:<\/b>\s*\w+\s+(\d{1,2}\s+\w+\s+\d{4})/g;

  for (const m of html.matchAll(rowRe)) {
    const priceStr = m[1];
    const currency = m[2];
    const title = (m[3] || "").trim();
    const dateStr = m[4];

    let ts = null;
    if (dateStr) {
      const parsed = new Date(dateStr).getTime();
      if (Number.isFinite(parsed)) ts = parsed;
    }
    if (cutoffMs && ts != null && ts < cutoffMs) continue;

    const price = parseFloat(priceStr);
    if (!Number.isFinite(price) || price <= 0) continue;

    const priceCad = currency === "CAD"
      ? price
      : Math.round(price * usdToCad * 100) / 100;
    sales.push({
      priceCad,
      date: ts != null ? new Date(ts).toISOString().slice(0, 10) : "",
      title,
    });
  }

  return sales;
}

function calcMedian(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Médiane robuste : trim 10% bas / 10% haut avant le calcul.
 * Élimine les outliers (ventes anormales, erreurs de listing) tout en
 * gardant le centre de la distribution.
 * @param {number[]} arr
 */
function trimmedMedian(arr) {
  if (!arr.length) return null;
  if (arr.length < 5) return calcMedian(arr);
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const trimLo = Math.floor(n * 0.10);
  const trimHi = Math.ceil(n * 0.10);
  const trimmed = sorted.slice(trimLo, n - trimHi);
  return trimmed.length ? calcMedian(trimmed) : calcMedian(sorted);
}

/**
 * Garde uniquement les ventes 130point dont le fingerprint matche celui
 * du listing cible (même cardCode, même parallèle, même grade, même insert).
 * Si le fingerprint d'une vente est introuvable, on la garde par prudence
 * (le trim de la médiane la lissera si c'est un outlier).
 *
 * @param {Array<{ priceCad: number; date: string; title: string }>} sales
 * @param {string} sampleTitle - titre du listing eBay cible
 * @returns {Array<{ priceCad: number; date: string; title: string }>}
 */
function filterSalesBySampleFingerprint(sales, sampleTitle) {
  if (!sampleTitle) return sales;
  const target = extractCardFingerprint(sampleTitle);
  if (!target) return sales;

  const targetGrade = target.grade
    ? target.grade.replace(/\s+/g, "").toLowerCase()
    : null;

  return sales.filter((s) => {
    if (!s.title) return true;
    const fp = extractCardFingerprint(s.title);
    if (!fp) return true;
    // #carte : si les deux titres ont un code, ils doivent matcher
    if (target.cardCode && fp.cardCode && target.cardCode !== fp.cardCode) {
      return false;
    }
    // Parallèles, inserts nommés : exact match (les deux null OK)
    if (target.parallelTag !== fp.parallelTag) return false;
    if (target.parallelColor !== fp.parallelColor) return false;
    if (target.namedInsert !== fp.namedInsert) return false;
    // Grade : exact match (raw vs raw, PSA 10 vs PSA 10)
    const saleGrade = fp.grade
      ? fp.grade.replace(/\s+/g, "").toLowerCase()
      : null;
    if (targetGrade !== saleGrade) return false;
    return true;
  });
}

/**
 * Récupère les stats de ventes 130point pour une requête.
 * Retour mis en cache 24h dans Supabase (via persistentCache).
 *
 * @param {string} query - ex: "savoie 2023 young guns 729"
 * @param {number} [days=120] - fenêtre de temps en jours
 * @param {string} [sampleTitle] - titre d'un listing cible. Si fourni,
 *   les ventes sont post-filtrées par fingerprint (rejette parallèles
 *   et grades qui polluent la médiane).
 * @returns {Promise<{ medianCad: number|null; count: number; source: '130point'|'none'; comps?: Array }>}
 */
export async function getSoldPriceStats(query, days = SOLD_WINDOW_DAYS, sampleTitle = null) {
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedSample = sampleTitle
    ? sampleTitle.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
  // Le cache key inclut le sampleTitle pour que deux listings différents
  // (base vs parallèle) avec la même query 130point gardent des médianes
  // filtrées distinctes.
  const cacheKey = `sold_130pt_v3:${normalizedQuery}:${days}d:${normalizedSample}`;

  // Vérifie le cache (24h)
  const cached = await readJsonCache(cacheKey);
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const body = new URLSearchParams({
      query,
      sort: "EndTimeSoonest",
      mp: "all",
      tab_id: "1",
      tz: "America/New_York",
      width: "400",
      height: "800",
      tk: TK,
    });

    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    if (!res.ok) return { medianCad: null, count: 0, source: "none" };

    const html = await res.text();
    const allSales = parseSoldPrices(html, cutoffMs);
    const sales = sampleTitle
      ? filterSalesBySampleFingerprint(allSales, sampleTitle)
      : allSales;
    const prices = sales.map((s) => s.priceCad);
    const compsSorted = [...sales].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const result = {
      medianCad: prices.length > 0
        ? Math.round((trimmedMedian(prices) ?? 0) * 100) / 100
        : null,
      count: prices.length,
      source: prices.length >= MIN_SOLD_COMPS ? "130point" : "none",
      comps: compsSorted.slice(0, 8),
    };

    await writeJsonCache(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  } catch {
    return { medianCad: null, count: 0, source: "none" };
  }
}

/**
 * Enrichit une fairMap eBay avec les prix de ventes réelles (130point).
 * Pour chaque cohorte avec ≥3 ventes sur 60 jours, remplace la juste-valeur eBay active.
 * Silencieux en cas d'erreur (fallback = fairMap original).
 *
 * @param {Map<string, { fairValueCad: number|null; comps: number; confidence: string }>} fairMap
 * @param {string} playerName
 * @returns {Promise<Map<string, { fairValueCad: number|null; comps: number; confidence: string; fairValueSource?: string }>>}
 */
export async function enrichFairMapWith130Point(fairMap, playerName) {
  if (!fairMap.size) return fairMap;

  // Trier les cohortes par nb de comps eBay décroissant → prioriser les plus liquides
  const sorted = [...fairMap.entries()]
    .sort(([, a], [, b]) => (b.comps ?? 0) - (a.comps ?? 0));

  // Construire les requêtes et dédupliquer.
  // Priorité 1 : extractCardFingerprint(sampleTitle).searchQuery
  //   → query précise (cardCode, grade exact, label fin).
  // Fallback : buildQuery(playerName, cohortKey)
  //   → query grossière (groupType générique, sans #carte).
  // Le sampleTitle est aussi conservé pour le post-filtre par fingerprint.
  /** @type {Map<string, { keys: string[]; sampleTitle: string | null }>} */
  const queryMap = new Map(); // query → { keys, sampleTitle }
  for (const [key, value] of sorted) {
    let q = "";
    const sampleTitle = value?.sampleTitle;
    if (sampleTitle) {
      const fp = extractCardFingerprint(sampleTitle);
      if (fp?.searchQuery) q = fp.searchQuery;
    }
    if (!q) q = buildQuery(playerName, key);
    if (!q.trim()) continue;
    if (!queryMap.has(q)) queryMap.set(q, { keys: [], sampleTitle: sampleTitle ?? null });
    queryMap.get(q).keys.push(key);
  }

  // Appels parallèles (toutes uniques)
  const entries = [...queryMap.entries()];
  const results = await Promise.all(
    entries.map(async ([q, { keys, sampleTitle }]) => {
      const stats = await getSoldPriceStats(q, undefined, sampleTitle);
      return { keys, stats };
    })
  );

  // Injecter les résultats dans une copie de fairMap
  const enriched = new Map(fairMap);
  for (const { keys, stats } of results) {
    if (stats.source !== "130point" || stats.medianCad == null) continue;
    for (const key of keys) {
      const existing = enriched.get(key);
      if (!existing) continue;
      const confidence =
        stats.count >= 8 ? "high" : stats.count >= 5 ? "medium" : "low";
      enriched.set(key, {
        ...existing,
        fairValueCad: stats.medianCad,
        comps: stats.count,
        confidence,
        fairValueSource: "130point",
        comps130: Array.isArray(stats.comps) ? stats.comps : [],
      });
    }
  }

  return enriched;
}
