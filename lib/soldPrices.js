import "server-only";

import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";

const TK = "dc848953a13185261a89";
const BASE_URL = "https://back.130point.com/cards/";
const USD_TO_CAD = 1.37;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MIN_SOLD_COMPS = 3;
const MAX_COHORTS_TO_ENRICH = 10; // max parallel calls per player

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
 * Parse le HTML 130point et retourne les prix CAD des ventes après cutoffMs.
 * @param {string} html
 * @param {number} cutoffMs
 * @returns {number[]}
 */
function parseSoldPrices(html, cutoffMs) {
  const prices = [];

  // data-price et data-currency sont directement sur chaque <tr id="dRow">
  const rowRe = /<tr\s+id="dRow"[^>]*data-price="([\d.]+)"[^>]*data-currency="(USD|CAD)"/g;
  // Date au format "Tue 09 Jun 2026 12:40:23 EDT"
  const dateRe = /Date:<\/b>\s*\w+\s+(\d{1,2}\s+\w+\s+\d{4})/g;

  const rowMatches = [...html.matchAll(rowRe)];
  const dateMatches = [...html.matchAll(dateRe)];

  for (let i = 0; i < rowMatches.length; i++) {
    const priceStr = rowMatches[i][1];
    const currency = rowMatches[i][2];
    const dateStr = dateMatches[i]?.[1]; // ex: "09 Jun 2026"

    if (dateStr && cutoffMs) {
      const ts = new Date(dateStr).getTime();
      if (Number.isFinite(ts) && ts < cutoffMs) continue;
    }

    const price = parseFloat(priceStr);
    if (!Number.isFinite(price) || price <= 0) continue;

    const priceCad = currency === "CAD"
      ? price
      : Math.round(price * USD_TO_CAD * 100) / 100;
    prices.push(priceCad);
  }

  return prices;
}

function calcMedian(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Récupère les stats de ventes 130point pour une requête.
 * Retour mis en cache 24h dans Supabase (via persistentCache).
 *
 * @param {string} query - ex: "Cole Caufield 2021 young guns"
 * @param {number} [days=60] - fenêtre de temps en jours
 * @returns {Promise<{ medianCad: number|null; count: number; source: '130point'|'none' }>}
 */
export async function getSoldPriceStats(query, days = 60) {
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  const cacheKey = `sold_130pt:${normalizedQuery}:${days}d`;

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
    const prices = parseSoldPrices(html, cutoffMs);

    const result = {
      medianCad: prices.length > 0
        ? Math.round((calcMedian(prices) ?? 0) * 100) / 100
        : null,
      count: prices.length,
      source: prices.length >= MIN_SOLD_COMPS ? "130point" : "none",
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
    .sort(([, a], [, b]) => (b.comps ?? 0) - (a.comps ?? 0))
    .slice(0, MAX_COHORTS_TO_ENRICH);

  // Construire les requêtes et dédupliquer
  const queryMap = new Map(); // query → [cohortKey, ...]
  for (const [key] of sorted) {
    const q = buildQuery(playerName, key);
    if (!q.trim()) continue;
    if (!queryMap.has(q)) queryMap.set(q, []);
    queryMap.get(q).push(key);
  }

  // Appels parallèles (toutes uniques)
  const entries = [...queryMap.entries()];
  const results = await Promise.all(
    entries.map(async ([q, keys]) => {
      const stats = await getSoldPriceStats(q);
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
      });
    }
  }

  return enriched;
}
