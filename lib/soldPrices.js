import "server-only";

import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { extractCardFingerprint, extractPartialFeatures } from "@/lib/cardNumberExtractor";
import { getUsdToCadRateSync } from "@/lib/fxRate";
import { matchCompsWithAI, COMP_MATCH_BATCH_MAX } from "@/lib/compMatcher";

const TK = "dc848953a13185261a89";
const BASE_URL = "https://back.130point.com/cards/";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MIN_SOLD_COMPS = 3;
const SOLD_WINDOW_DAYS = 120;
// Demi-vie du poids d'une vente : une vente d'il y a 30j pèse moitié moins
// qu'une vente d'aujourd'hui. Garde la fenêtre 120j (volume) mais colle la
// médiane au marché ACTUEL au lieu de traîner 4 mois de retard.
const RECENCY_HALF_LIFE_DAYS = 30;

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
  // Nouveau format fingerprint : "lastname-year-type-variant-set-…" (pas de "|").
  // Avant, le split("|") renvoyait la clé entière comme groupType → keywords ""
  // → repli réduit au NOM DU JOUEUR SEUL = toutes ses cartes (moteur du bug B2).
  // On reconstruit une requête tenant compte du set/type, bien plus étroite.
  if (cohortKey && !cohortKey.includes("|")) {
    const raw = cohortKey.startsWith("pf|") ? cohortKey.slice(3) : cohortKey;
    const parts = raw.split("-");
    const year = /^\d{4}$/.test(parts[1] ?? "") ? parts[1] : null;
    // Tokens descriptifs = tout après nom+année, en mots (on retire les
    // fragments numériques : « 23 » d'un « 2022-23 », un #carte, un /tirage).
    const descr = parts.slice(2).filter((p) => p && p !== "?" && !/^\d/.test(p) && p[0] !== "/");
    const tokens = [playerName.trim()];
    if (year) tokens.push(year);
    tokens.push(...descr);
    return tokens.join(" ");
  }
  // Ancien format "groupType|year|numbering".
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

/**
 * Poids de récence d'une vente : 0.5^(âge_en_jours / demi-vie).
 * Vente sans date → âge médian de la fenêtre (poids neutre, ni boost ni
 * pénalité indue).
 * @param {{ date?: string }} sale
 * @param {number} nowMs
 * @param {number} windowDays
 */
function recencyWeight(sale, nowMs, windowDays) {
  let ageDays = windowDays / 2;
  if (sale?.date) {
    const ts = new Date(sale.date).getTime();
    if (Number.isFinite(ts)) {
      ageDays = Math.max(0, (nowMs - ts) / (24 * 60 * 60 * 1000));
    }
  }
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Quantile pondéré : trie par prix, cumule les poids, retourne le prix où le
 * cumul atteint q × poids_total. Exporté pour testabilité (fixtures).
 * @param {Array<{ priceCad: number; weight: number }>} weighted - trié ou non
 * @param {number} q - 0..1
 * @returns {number | null}
 */
export function weightedQuantile(weighted, q) {
  if (!Array.isArray(weighted) || weighted.length === 0) return null;
  const sorted = [...weighted].sort((a, b) => a.priceCad - b.priceCad);
  const total = sorted.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return sorted[Math.floor(sorted.length / 2)].priceCad;
  const target = q * total;
  let cum = 0;
  for (const w of sorted) {
    cum += w.weight;
    if (cum >= target) return w.priceCad;
  }
  return sorted[sorted.length - 1].priceCad;
}

/**
 * Agrégation robuste des ventes :
 *  - trim 10% bas / 10% haut par prix (n ≥ 5) — élimine erreurs de listing
 *  - médiane + P25/P75 pondérés par récence (demi-vie 30j)
 *  - date de la vente la plus récente
 * Exporté pour testabilité (fixtures, pas de réseau).
 * @param {Array<{ priceCad: number; date?: string }>} sales
 * @param {number} [nowMs]
 * @param {number} [windowDays]
 * @returns {{ medianCad: number|null; p25Cad: number|null; p75Cad: number|null; lastSaleDate: string|null }}
 */
export function aggregateSales(sales, nowMs = Date.now(), windowDays = SOLD_WINDOW_DAYS) {
  const valid = (Array.isArray(sales) ? sales : []).filter(
    (s) => Number.isFinite(s?.priceCad) && s.priceCad > 0
  );
  if (valid.length === 0) {
    return { medianCad: null, p25Cad: null, p75Cad: null, lastSaleDate: null };
  }

  const sortedByPrice = [...valid].sort((a, b) => a.priceCad - b.priceCad);
  let trimmed = sortedByPrice;
  if (sortedByPrice.length >= 5) {
    const n = sortedByPrice.length;
    const lo = Math.floor(n * 0.10);
    const hi = Math.ceil(n * 0.10);
    const cut = sortedByPrice.slice(lo, n - hi);
    if (cut.length > 0) trimmed = cut;
  }

  const weighted = trimmed.map((s) => ({
    priceCad: s.priceCad,
    weight: recencyWeight(s, nowMs, windowDays),
  }));

  const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  const lastSaleDate = valid.reduce(
    (max, s) => (s.date && s.date > max ? s.date : max),
    ""
  );

  return {
    medianCad: round2(weightedQuantile(weighted, 0.5)),
    p25Cad: round2(weightedQuantile(weighted, 0.25)),
    p75Cad: round2(weightedQuantile(weighted, 0.75)),
    lastSaleDate: lastSaleDate || null,
  };
}

/**
 * Garde uniquement les ventes 130point compatibles avec le listing cible :
 * même #carte, même parallèle/couleur, même insert, même tirage, même grade.
 *
 * Utilise extractPartialFeatures (pas le fingerprint complet) : les titres
 * eBay commencent souvent par l'année, ce qui vidait le nom et rendait le
 * fingerprint null → la vente était gardée "par prudence" et une carte RAW
 * pouvait polluer la médiane d'une PSA 10. Les traits partiels (grade,
 * couleur, /tirage, #carte) se détectent sans nom ni année.
 *
 * Fallback du matching DeepSeek (compMatcher.js) — utilisé quand l'appel
 * IA échoue (clé manquante, réseau, format).
 *
 * @param {Array<{ priceCad: number; date: string; title: string }>} sales
 * @param {string} sampleTitle - titre du listing eBay cible
 * @returns {Array<{ priceCad: number; date: string; title: string }>}
 */
/**
 * Deux familles de cartes sont INCOMPATIBLES quand les deux sont connues et
 * différentes. Un `null` ne tranche pas (titre trop pauvre) : on laisse passer,
 * les autres traits feront le tri — refuser sur un null viderait les cohortes
 * dont les vendeurs écrivent mal les titres.
 * @param {string | null} a
 * @param {string | null} b
 * @returns {boolean} true si les deux familles s'excluent
 */
function cardTypesConflict(a, b) {
  return a != null && b != null && a !== b;
}

/**
 * Garde-fou DÉTERMINISTE appliqué APRÈS le matching DeepSeek. Le LLM peut
 * violer la règle du prompt — il a réellement validé six ventes de « Series 1
 * Young Guns Outburst #205 » (~656 $) comme comparables d'une « Extended
 * Outburst 1st Round Draft » (~130 $), fabriquant un « −81 % sous la cote »
 * sur une carte au prix normal. Même philosophie qu'`applyPlayerQualityCap`
 * dans dealInvestmentScore.js : une règle structurelle ne se délègue pas à un
 * modèle.
 * @param {Array<{ priceCad: number; date: string; title: string }>} sales
 * @param {string} sampleTitle
 * @returns {{ kept: Array<{ priceCad: number; date: string; title: string }>; rejected: number }}
 */
function guardCardTypeAgainstTarget(sales, sampleTitle) {
  const target = extractPartialFeatures(sampleTitle);
  if (!target) return { kept: sales, rejected: 0 };
  if (!target.cardType && !target.seriesTag) return { kept: sales, rejected: 0 };

  const kept = sales.filter((s) => {
    if (!s.title) return true;
    const fp = extractPartialFeatures(s.title);
    if (cardTypesConflict(target.cardType, fp?.cardType ?? null)) return false;
    // Série Upper Deck : Series 1 / Series 2 / Extended ne partagent aucune
    // carte. Même règle — un null ne tranche jamais.
    if (cardTypesConflict(target.seriesTag, fp?.seriesTag ?? null)) return false;
    return true;
  });
  return { kept, rejected: sales.length - kept.length };
}

function filterSalesBySampleFingerprint(sales, sampleTitle) {
  if (!sampleTitle) return sales;
  const target = extractPartialFeatures(sampleTitle);
  if (!target) return sales;

  const normGrade = (g) => (g ? String(g).replace(/\s+/g, "").toLowerCase() : null);
  const targetGrade = normGrade(target.grade);

  return sales.filter((s) => {
    if (!s.title) return true;
    const fp = extractPartialFeatures(s.title);
    if (!fp) return true;
    // #carte : si les deux titres ont un code, ils doivent matcher
    if (target.cardCode && fp.cardCode && target.cardCode !== fp.cardCode) {
      return false;
    }
    // Famille de carte : une Young Guns n'est pas une Outburst Extended, même
    // si les deux portent le parallèle « outburst ». Voir cardTypesConflict.
    if (cardTypesConflict(target.cardType, fp.cardType)) return false;
    // Série : Series 1 / Series 2 / Extended sont mutuellement exclusifs.
    if (cardTypesConflict(target.seriesTag, fp.seriesTag)) return false;
    // Parallèles, variantes, inserts nommés : exact match (les deux null OK).
    // variantTag (retro/canvas/deluxe…) empêche une YG Retro de polluer la
    // médiane d'une YG régulière — bug B1 (PLAN-HOTTEST-DEALS.md).
    if (target.parallelTag !== fp.parallelTag) return false;
    if (target.parallelColor !== fp.parallelColor) return false;
    if (target.variantTag !== fp.variantTag) return false;
    if (target.namedInsert !== fp.namedInsert) return false;
    // Tirage limité : /99 vs base (ou /25 vs /99) = cartes différentes
    if (target.printRun !== fp.printRun) return false;
    // Grade : exact match (raw vs raw, PSA 10 vs PSA 10)
    if (targetGrade !== normGrade(fp.grade)) return false;
    return true;
  });
}

/**
 * Filtre les ventes contre le listing cible. Matching DeepSeek en premier
 * (comprend toutes les variantes d'écriture des titres eBay), fingerprint
 * regex en fallback si l'IA échoue.
 * @param {Array<{ priceCad: number; date: string; title: string }>} sales
 * @param {string | null} sampleTitle
 * @returns {Promise<{ sales: Array<{ priceCad: number; date: string; title: string }>; matchMethod: "ai" | "regex" | "none" }>}
 */
async function filterSalesForTarget(sales, sampleTitle) {
  if (!sampleTitle || sales.length === 0) {
    return { sales, matchMethod: "none" };
  }

  // Les plus récentes d'abord pour que le cap de batch IA (40) garde les
  // ventes qui pèsent le plus dans la médiane pondérée par récence.
  const recentFirst = [...sales].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );
  const batch = recentFirst.slice(0, COMP_MATCH_BATCH_MAX);

  const ai = await matchCompsWithAI(sampleTitle, batch);
  if (ai.ok) {
    const aiKept = batch.filter((_, i) => ai.matchedIndexes.has(i));
    // Le verdict de l'IA passe toujours par le garde-fou déterministe.
    const { kept, rejected } = guardCardTypeAgainstTarget(aiKept, sampleTitle);
    if (rejected > 0) {
      console.error(
        `[soldPrices] garde-fou : ${rejected}/${aiKept.length} comps validés par l'IA rejetés (famille de carte différente) pour "${sampleTitle.slice(0, 70)}"`
      );
    }
    return { sales: kept, matchMethod: "ai" };
  }

  console.error("[soldPrices] matching IA indisponible, fallback regex:", ai.error);
  return {
    sales: filterSalesBySampleFingerprint(sales, sampleTitle),
    matchMethod: "regex",
  };
}

/**
 * Un fetch 130point brut pour une requête. Retourne les ventes parsées
 * (non filtrées) ou null si l'appel échoue.
 * @param {string} query
 * @param {number} cutoffMs
 * @returns {Promise<Array<{ priceCad: number; date: string; title: string }> | null>}
 */
async function fetch130PointSales(query, cutoffMs) {
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
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`[soldPrices] 130point HTTP ${res.status} pour "${query.slice(0, 60)}"`);
      return null;
    }

    const html = await res.text();
    return parseSoldPrices(html, cutoffMs);
  } catch (err) {
    console.error("[soldPrices] 130point fetch failed:", err?.message ?? err);
    return null;
  }
}

const EMPTY_STATS = Object.freeze({
  medianCad: null,
  count: 0,
  source: "none",
  rangeCad: null,
  lastSaleDate: null,
  matchMethod: "none",
  scope: "exact",
});

/**
 * Récupère les stats de ventes 130point pour une requête.
 * Retour mis en cache 24h dans Supabase (via persistentCache).
 *
 * Précision :
 *  - matching des comps par DeepSeek (fallback regex fingerprint)
 *  - médiane pondérée par récence (demi-vie 30j) + trim des outliers
 *  - range P25–P75 + date de dernière vente exposés pour l'UI
 *  - si la requête précise donne < 3 comps, une requête de repli élargie
 *    (fallbackQuery) est tentée automatiquement
 *
 * @param {string} query - ex: "savoie 2023 young guns 729"
 * @param {number} [days=120] - fenêtre de temps en jours
 * @param {string} [sampleTitle] - titre d'un listing cible. Si fourni,
 *   les ventes sont post-filtrées (IA puis regex) contre ce titre.
 * @param {{ fallbackQuery?: string | null }} [options]
 * @returns {Promise<{ medianCad: number|null; count: number; source: '130point'|'none'; rangeCad: { p25Cad: number, p75Cad: number } | null; lastSaleDate: string|null; matchMethod: string; comps?: Array }>}
 */
export async function getSoldPriceStats(query, days = SOLD_WINDOW_DAYS, sampleTitle = null, options = {}) {
  const fallbackQuery = options?.fallbackQuery?.trim() || null;
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  const normalizedSample = sampleTitle
    ? sampleTitle.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
  // Le cache key inclut le sampleTitle pour que deux listings différents
  // (base vs parallèle) avec la même query 130point gardent des médianes
  // filtrées distinctes. v4 : matching IA + agrégation pondérée + range.
  // Le numéro de version saute à CHAQUE changement des règles de filtrage des
  // comps — une entrée calculée sous d'anciennes règles est une cote fausse.
  //   v5 : garde-fou de famille de carte (`cardType`).
  //   v6 : garde-fou de série (`seriesTag` — Series 1 / Series 2 / Extended).
  const cacheKey = `sold_130pt_v6:${normalizedQuery}:${days}d:${normalizedSample}`;

  // Vérifie le cache (24h)
  const cached = await readJsonCache(cacheKey);
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const primarySales = await fetch130PointSales(query, cutoffMs);
  if (primarySales === null) return { ...EMPTY_STATS };

  let { sales, matchMethod } = await filterSalesForTarget(primarySales, sampleTitle);
  let queryUsed = query;

  // Escalade : requête précise trop étroite → repli élargi, on garde le
  // meilleur des deux (jamais moins de comps qu'avant).
  if (
    sales.length < MIN_SOLD_COMPS &&
    fallbackQuery &&
    fallbackQuery.toLowerCase().replace(/\s+/g, " ") !== normalizedQuery
  ) {
    const fallbackSales = await fetch130PointSales(fallbackQuery, cutoffMs);
    if (fallbackSales !== null && fallbackSales.length > 0) {
      const filtered = await filterSalesForTarget(fallbackSales, sampleTitle);
      if (filtered.sales.length > sales.length) {
        sales = filtered.sales;
        matchMethod = filtered.matchMethod;
        queryUsed = fallbackQuery;
      }
    }
  }

  const agg = aggregateSales(sales, Date.now(), days);
  const compsSorted = [...sales].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const result = {
    medianCad: agg.medianCad,
    count: sales.length,
    source: sales.length >= MIN_SOLD_COMPS ? "130point" : "none",
    rangeCad:
      agg.p25Cad != null && agg.p75Cad != null
        ? { p25Cad: agg.p25Cad, p75Cad: agg.p75Cad }
        : null,
    lastSaleDate: agg.lastSaleDate,
    matchMethod,
    queryUsed,
    // scope "broad" = résultat obtenu via la requête de repli élargie (toutes
    // les autos du joueur, tous sets confondus). Une cote broad peut informer
    // mais ne doit JAMAIS déclencher un signal de deal (« −44 % ») — bug B2,
    // la Suzuki auto MVP cotée depuis 34–112 $ d'AUTRES autos. Exploité en aval
    // par dealFinder.js (suppression du %) et l'UI (libellé « Réf. » ≠ « Cote »).
    scope: queryUsed === query ? "exact" : "broad",
    comps: compsSorted.slice(0, 8),
  };

  await writeJsonCache(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

/**
 * Enrichit une fairMap eBay avec les prix de ventes réelles (130point).
 * Pour chaque cohorte avec ≥3 ventes sur 120 jours, remplace la juste-valeur
 * eBay active. Silencieux en cas d'erreur (fallback = fairMap original).
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
  //   → query grossière (groupType générique, sans #carte), passée à
  //     getSoldPriceStats comme requête de repli si la précise donne < 3 comps.
  // Le sampleTitle est aussi conservé pour le post-filtre (IA/fingerprint).
  /** @type {Map<string, { keys: string[]; sampleTitle: string | null; fallbackQuery: string | null }>} */
  const queryMap = new Map(); // query → { keys, sampleTitle, fallbackQuery }
  for (const [key, value] of sorted) {
    let q = "";
    const sampleTitle = value?.sampleTitle;
    if (sampleTitle) {
      // playerName connu : l'empreinte réussit même si le titre place le
      // joueur après le set → requête 130point précise au lieu du repli large.
      const fp = extractCardFingerprint(sampleTitle, playerName);
      if (fp?.searchQuery) q = fp.searchQuery;
    }
    const broad = buildQuery(playerName, key).trim();
    if (!q) q = broad;
    if (!q.trim()) continue;
    if (!queryMap.has(q)) {
      queryMap.set(q, {
        keys: [],
        sampleTitle: sampleTitle ?? null,
        fallbackQuery: broad && broad !== q ? broad : null,
      });
    }
    queryMap.get(q).keys.push(key);
  }

  // Appels parallèles (toutes uniques)
  const entries = [...queryMap.entries()];
  const results = await Promise.all(
    entries.map(async ([q, { keys, sampleTitle, fallbackQuery }]) => {
      const stats = await getSoldPriceStats(q, undefined, sampleTitle, { fallbackQuery });
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
        confidence: stats.scope === "broad" ? "low" : confidence,
        fairValueSource: "130point",
        // scope "broad" → la médiane vient du repli élargi (autres cartes du
        // joueur) : valeur de RÉFÉRENCE seulement, jamais un signal de deal (B2).
        fairValueScope: stats.scope ?? "exact",
        comps130: Array.isArray(stats.comps) ? stats.comps : [],
        range130: stats.rangeCad ?? null,
        lastSale130: stats.lastSaleDate ?? null,
        matchMethod130: stats.matchMethod ?? "none",
      });
    }
  }

  return enriched;
}
