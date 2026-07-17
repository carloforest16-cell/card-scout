import "server-only";

import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { extractCardFingerprint } from "@/lib/cardNumberExtractor";
import { getUsdToCadRateSync } from "@/lib/fxRate";

/**
 * Validation croisée SportsCardsPro (pricecharting) — valeur par carte et
 * par grade, dérivée de ventes eBay réelles nettoyées par leur équipe.
 *
 * ⚠️ ANTI-BAN — SportsCardsPro banne agressivement les IP qui scrapent.
 * Ce module est construit pour être IMPOSSIBLE à faire déraper :
 *  - cache persistant 7 jours par carte, résultats négatifs inclus
 *    (une carte introuvable n'est pas re-cherchée pendant 7 jours) ;
 *  - throttle global : min 3s entre deux requêtes réseau, par process ;
 *  - plafond : max 12 requêtes réseau / heure / process ;
 *  - disjoncteur : le moindre 403/429/503 coupe la source 24h pour TOUT
 *    le déploiement (flag persistant Supabase, pas juste ce process) ;
 *  - jamais appelé en boucle : uniquement le flux /analyse (1 carte à la
 *    fois) — NE PAS l'ajouter dans dealFinder/opportunites/crons batch.
 *
 * Usage : signal de confiance UNIQUEMENT. La valeur affichée reste la
 * médiane 130point ; SCP sert à confirmer/nuancer (crossCheck).
 */

const SEARCH_URL = "https://www.sportscardspro.com/search-products";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const CIRCUIT_KEY = "scp_circuit_v1";
const CIRCUIT_OPEN_MS = 24 * 60 * 60 * 1000; // 24h
const MIN_GAP_MS = 3000;
const MAX_REQUESTS_PER_HOUR = 12;
const FETCH_TIMEOUT_MS = 8000;

// User-Agent de navigateur standard : les UA vides/bot-like sont le premier
// critère de ban. On ne se déguise pas en humain pour contourner un blocage
// actif (le disjoncteur fait l'inverse : on s'arrête), juste un UA normal.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// --- Throttle + plafond horaire (par process) ---
let lastRequestAt = 0;
let hourWindowStart = 0;
let hourCount = 0;
let chain = Promise.resolve();

function canSpendRequest() {
  const now = Date.now();
  if (now - hourWindowStart > 60 * 60 * 1000) {
    hourWindowStart = now;
    hourCount = 0;
  }
  if (hourCount >= MAX_REQUESTS_PER_HOUR) return false;
  hourCount++;
  return true;
}

/** Sérialise les fetchs SCP avec un espacement minimal. */
function throttled(fn) {
  const run = chain.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  // La chaîne ne doit jamais rester rejetée (sinon tous les appels suivants échouent)
  chain = run.catch(() => {});
  return run;
}

// --- Disjoncteur persistant ---
let memCircuitUntil = 0;

async function isCircuitOpen() {
  if (Date.now() < memCircuitUntil) return true;
  const flag = await readJsonCache(CIRCUIT_KEY);
  if (flag?.until && Date.now() < flag.until) {
    memCircuitUntil = flag.until;
    return true;
  }
  return false;
}

async function openCircuit(reason) {
  const until = Date.now() + CIRCUIT_OPEN_MS;
  memCircuitUntil = until;
  console.error(
    `[sportsCardsPro] DISJONCTEUR OUVERT 24h (${reason}) — aucune requête SCP jusqu'à ${new Date(until).toISOString()}`
  );
  await writeJsonCache(CIRCUIT_KEY, { until, reason, openedAt: Date.now() });
}

/**
 * Fetch SCP protégé : throttle, plafond, disjoncteur. Retourne le HTML ou
 * null (jamais de throw).
 * @param {string} url
 * @returns {Promise<string | null>}
 */
async function guardedFetch(url) {
  if (await isCircuitOpen()) return null;
  if (!canSpendRequest()) {
    console.error("[sportsCardsPro] plafond horaire atteint, requête sautée");
    return null;
  }
  return throttled(async () => {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": UA,
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-CA,en;q=0.9,fr-CA;q=0.8",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 403 || res.status === 429 || res.status === 503) {
        await openCircuit(`HTTP ${res.status}`);
        return null;
      }
      if (!res.ok) {
        console.error(`[sportsCardsPro] HTTP ${res.status} pour ${url.slice(0, 80)}`);
        return null;
      }
      return await res.text();
    } catch (err) {
      console.error("[sportsCardsPro] fetch failed:", err?.message ?? err);
      return null;
    }
  });
}

/**
 * Mapping grade Card Metrics → colonne de prix SCP.
 * (Doc officielle pricecharting : loose=Ungraded, cib=Grade 7, new=Grade 8,
 * graded=Grade 9, box-only=Grade 9.5, manual-only=PSA 10.)
 * @param {string | null} grade - ex "PSA 10", "BGS 9.5", null (raw)
 * @returns {string | null} id de la cellule prix dans le HTML produit
 */
function gradeToPriceCell(grade) {
  if (!grade) return "used_price"; // raw / ungraded
  const g = grade.toUpperCase().replace(/\s+/g, " ");
  const note = g.match(/(10|9\.5|9|8\.5|8|7\.5|7)$/)?.[1];
  if (g.startsWith("PSA") && note === "10") return "manual_only_price";
  switch (note) {
    case "9.5":
      return "box_only_price";
    case "9":
      return "graded_price";
    case "8":
    case "8.5":
      return "new_price";
    case "7":
    case "7.5":
      return "complete_price";
    default:
      return null; // BGS 10, notes basses… : pas de colonne fiable
  }
}

/**
 * Parse la page de résultats de recherche SCP : liens produit + texte.
 * Exporté pour testabilité (fixtures HTML).
 * @param {string} html
 * @returns {Array<{ href: string; text: string }>}
 */
export function parseScpSearchResults(html) {
  const out = [];
  const re = /<a[^>]+href="(\/game\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of String(html ?? "").matchAll(re)) {
    const text = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (text) out.push({ href: m[1], text });
  }
  return out;
}

/**
 * Choisit le meilleur produit SCP pour la carte cible. Match STRICT :
 * nom de famille + année obligatoires, #carte obligatoire si la cible en a
 * un. Mieux vaut aucun résultat qu'un mauvais produit (le cross-check
 * serait pire que rien).
 * Exporté pour testabilité.
 * @param {Array<{ href: string; text: string }>} results
 * @param {{ lastName: string; year: string; cardCode: string | null }} target
 * @returns {{ href: string; text: string } | null}
 */
export function pickScpProduct(results, target) {
  const lastName = String(target.lastName ?? "").toLowerCase();
  const yearHead = String(target.year ?? "").slice(0, 4);
  if (!lastName || !yearHead) return null;
  const code = target.cardCode ? String(target.cardCode).toLowerCase() : null;

  for (const r of results) {
    const hay = `${r.href} ${r.text}`.toLowerCase();
    if (!hay.includes(lastName)) continue;
    if (!hay.includes(yearHead)) continue;
    if (code) {
      // le # est encodé "-451" dans le slug ou "#451" dans le texte
      const codeNum = code.replace(/^[a-z]+-?/, "");
      if (!hay.includes(`#${code}`) && !hay.includes(`-${codeNum}`) && !hay.includes(`#${codeNum}`)) {
        continue;
      }
    }
    return r;
  }
  return null;
}

/**
 * Parse la valeur d'une cellule de prix sur la page produit SCP.
 * Structure pricecharting : <td id="used_price" ...> ... $782.99 ...
 * Exporté pour testabilité.
 * @param {string} html
 * @param {string} cellId
 * @returns {number | null} prix USD ou null
 */
export function parseScpPriceCell(html, cellId) {
  const re = new RegExp(
    `<td[^>]*id="${cellId}"[^>]*>[\\s\\S]{0,400}?\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)`,
    "i"
  );
  const m = String(html ?? "").match(re);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ""));
  // "$0.00" ou "-" = SCP n'a pas de donnée pour ce grade
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Valeur SportsCardsPro (CAD) pour une carte identifiée par son titre eBay.
 * 2 requêtes réseau max (recherche + page produit), cache 7 jours, tout
 * échec → null sans jamais bloquer l'appelant.
 *
 * @param {string} sampleTitle - titre du listing eBay cible
 * @returns {Promise<{ valueCad: number; grade: string | null; productUrl: string; asOfIso: string } | null>}
 */
export async function getScpValueForCard(sampleTitle) {
  const fp = extractCardFingerprint(String(sampleTitle ?? ""));
  if (!fp?.lastName || !fp?.year) return null;

  const cell = gradeToPriceCell(fp.grade);
  if (!cell) return null;

  const queryParts = [fp.lastName, fp.year.slice(0, 4), fp.setName ?? "", fp.cardCode ?? ""]
    .filter(Boolean)
    .join(" ");
  const cacheKey = `scp_value_v1:${queryParts.toLowerCase()}:${cell}`;

  const cached = await readJsonCache(cacheKey);
  if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data; // peut être null (résultat négatif caché aussi)
  }

  // `resolved` = le pipeline a une vraie réponse SCP (positive ou "carte
  // introuvable"). Un null causé par le disjoncteur/plafond/réseau n'est PAS
  // une réponse et ne doit jamais être caché 7 jours.
  let data = null;
  let resolved = false;

  const searchHtml = await guardedFetch(
    `${SEARCH_URL}?q=${encodeURIComponent(queryParts)}&type=prices`
  );
  if (searchHtml !== null) {
    const product = pickScpProduct(parseScpSearchResults(searchHtml), {
      lastName: fp.lastName,
      year: fp.year,
      cardCode: fp.cardCode,
    });
    if (!product) {
      resolved = true; // vraie réponse : aucun produit ne matche
    } else {
      const productHtml = await guardedFetch(
        `https://www.sportscardspro.com${product.href}`
      );
      if (productHtml !== null) {
        resolved = true; // vraie réponse : prix présent ou absent pour ce grade
        const usd = parseScpPriceCell(productHtml, cell);
        if (usd != null) {
          data = {
            valueCad: Math.round(usd * getUsdToCadRateSync() * 100) / 100,
            grade: fp.grade ?? null,
            productUrl: `https://www.sportscardspro.com${product.href}`,
            asOfIso: new Date().toISOString(),
          };
        }
      }
    }
  }

  // On cache aussi les négatifs — sinon chaque carte introuvable re-frappe
  // SCP à chaque analyse, exactement le pattern qui mène au ban.
  if (resolved) {
    await writeJsonCache(cacheKey, { data, fetchedAt: Date.now() });
  }
  return data;
}
