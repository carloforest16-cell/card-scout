import "server-only";

import { getSoldPriceStats } from "@/lib/soldPrices";

/**
 * Source de vérité unique pour "combien vaut cette carte", peu importe le
 * consommateur (Deal Finder, Analyse, Portfolio, Enchères). Hiérarchie :
 *   1. Médiane des ventes réelles 130point (≥3 ventes, fenêtre 120j)
 *      → source "sold" (confidence "high" si ≥5 ventes, sinon "medium")
 *   2. Sinon, la médiane des annonces actives eBay pour la même cohorte,
 *      déjà calculée par l'appelant (chaque consommateur a sa propre
 *      stratégie de recherche de cohorte — ce module ne la refait pas)
 *      → source "asking" (confidence "low", toujours — un prix demandé
 *        n'est jamais qu'indicatif, peu importe le nombre de comps).
 *
 * Ce module ne réimplémente PAS la logique de scraping/agrégation
 * existante (`soldPrices.js`, `dealFinder.js`) — il l'oriente et
 * normalise sa sortie dans une forme commune que toute l'UI peut
 * afficher de façon honnête (badges de provenance — voir tâche 2.2).
 */

const SOLD_MIN_COMPS = 3;
const SOLD_HIGH_CONFIDENCE_COMPS = 5;

/**
 * @typedef {{
 *   valueCad: number | null,
 *   source: "sold" | "asking" | "none",
 *   sampleSize: number,
 *   asOfIso: string,
 *   confidence: "high" | "medium" | "low",
 * }} MarketValue
 */

/**
 * Résout la valeur marché d'une carte précise (une cohorte à la fois).
 * Fait un appel réseau 130point (via `getSoldPriceStats`, caché 24h) — à
 * utiliser pour des lookups ponctuels (ex. /analyse, une carte à la fois),
 * pas en boucle sur des dizaines de cohortes (voir `normalizeFromFairMap`
 * pour les consommateurs qui traitent déjà un lot de cohortes en parallèle
 * via `enrichFairMapWith130Point`).
 *
 * @param {{
 *   query: string,                 // requête 130point (ex. fingerprint.searchQuery)
 *   sampleTitle?: string | null,   // titre d'annonce pour post-filtrer par fingerprint
 *   askingValueCad?: number | null,   // fallback déjà calculé par l'appelant
 *   askingSampleSize?: number,        // nb de comps derrière ce fallback
 * }} params
 * @returns {Promise<MarketValue>}
 */
export async function getMarketValue({
  query,
  sampleTitle = null,
  askingValueCad = null,
  askingSampleSize = 0,
}) {
  const asOfIso = new Date().toISOString();

  if (query) {
    const sold = await getSoldPriceStats(query, undefined, sampleTitle);
    if (sold.source === "130point" && sold.medianCad != null && sold.count >= SOLD_MIN_COMPS) {
      return {
        valueCad: sold.medianCad,
        source: "sold",
        sampleSize: sold.count,
        asOfIso,
        confidence: sold.count >= SOLD_HIGH_CONFIDENCE_COMPS ? "high" : "medium",
      };
    }
  }

  if (askingValueCad != null) {
    return {
      valueCad: askingValueCad,
      source: "asking",
      sampleSize: askingSampleSize,
      asOfIso,
      confidence: "low",
    };
  }

  return { valueCad: null, source: "none", sampleSize: 0, asOfIso, confidence: "low" };
}

/**
 * Normalise une entrée déjà enrichie par `enrichFairMapWith130Point`
 * (dealFinder.js, auctionDeals.js) dans la forme canonique — sans
 * refaire le fetch, juste relabeliser ce qui a déjà été décidé.
 * @param {{ fairValueCad?: number | null, comps?: number, fairValueSource?: string | null }} entry
 * @param {string} [asOfIso]
 * @returns {MarketValue}
 */
export function normalizeFromFairMapEntry(entry, asOfIso = new Date().toISOString()) {
  const valueCad = entry?.fairValueCad ?? null;
  const sampleSize = Number(entry?.comps) || 0;
  if (valueCad == null) {
    return { valueCad: null, source: "none", sampleSize: 0, asOfIso, confidence: "low" };
  }
  if (entry?.fairValueSource === "130point") {
    return {
      valueCad,
      source: "sold",
      sampleSize,
      asOfIso,
      confidence: sampleSize >= SOLD_HIGH_CONFIDENCE_COMPS ? "high" : "medium",
    };
  }
  return { valueCad, source: "asking", sampleSize, asOfIso, confidence: "low" };
}

/**
 * Normalise une valeur issue de `card_price_history` (portfolioValue.js) —
 * ce snapshot est lui-même dérivé d'annonces eBay actives (cron
 * `card-prices`, pas 130point), donc toujours source "asking" en toute
 * honnêteté, avec `asOfIso` = date réelle du snapshot (pas "maintenant").
 * @param {{ valueCad: number | null, snapshotDateIso?: string | null }} params
 * @returns {MarketValue}
 */
export function normalizeFromPriceHistory({ valueCad, snapshotDateIso }) {
  if (valueCad == null) {
    return { valueCad: null, source: "none", sampleSize: 0, asOfIso: new Date().toISOString(), confidence: "low" };
  }
  return {
    valueCad,
    source: "asking",
    sampleSize: 1,
    asOfIso: snapshotDateIso ?? new Date().toISOString(),
    confidence: "low",
  };
}

/**
 * Enveloppe générique pour une valeur déjà connue comme "asking" (annonces
 * actives) — pour les consommateurs qui n'ont ni fairMap ni card_price_history,
 * juste une médiane eBay déjà calculée (ex. `/api/portfolio/value`).
 * @param {{ valueCad: number | null, sampleSize?: number, asOfIso?: string }} params
 * @returns {MarketValue}
 */
export function wrapAskingValue({ valueCad, sampleSize = 0, asOfIso = new Date().toISOString() }) {
  if (valueCad == null) {
    return { valueCad: null, source: "none", sampleSize: 0, asOfIso, confidence: "low" };
  }
  return { valueCad, source: "asking", sampleSize, asOfIso, confidence: "low" };
}
