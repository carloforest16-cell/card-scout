import "server-only";

import { getSoldPriceStats } from "@/lib/soldPrices";
import { getScpValueForCard } from "@/lib/sportsCardsPro";

/**
 * Source de vérité unique pour "combien vaut cette carte", peu importe le
 * consommateur (Deal Finder, Analyse, Portfolio, Enchères). Hiérarchie :
 *   1. Médiane des ventes réelles 130point (≥3 ventes, fenêtre 120j),
 *      pondérée par récence (demi-vie 30j), comps validés par DeepSeek
 *      → source "sold" (confidence "high" si ≥5 ventes, sinon "medium")
 *   2. Sinon, la médiane des annonces actives eBay pour la même cohorte,
 *      déjà calculée par l'appelant (chaque consommateur a sa propre
 *      stratégie de recherche de cohorte — ce module ne la refait pas)
 *      → source "asking" (confidence "low", toujours — un prix demandé
 *        n'est jamais qu'indicatif, peu importe le nombre de comps).
 *
 * Validation croisée (getMarketValue seulement, flux 1-carte-à-la-fois) :
 * SportsCardsPro fournit une valeur indépendante par carte/grade. Si elle
 * confirme la médiane 130point (±20%), la confiance monte ; si elle
 * diverge fortement (>40%), la confiance redescend d'un cran. La valeur
 * affichée reste TOUJOURS la médiane 130point — SCP est un signal, pas
 * une source d'affichage.
 *
 * Ce module ne réimplémente PAS la logique de scraping/agrégation
 * existante (`soldPrices.js`, `dealFinder.js`) — il l'oriente et
 * normalise sa sortie dans une forme commune que toute l'UI peut
 * afficher de façon honnête (badges de provenance — voir tâche 2.2).
 */

const SOLD_MIN_COMPS = 3;
const SOLD_HIGH_CONFIDENCE_COMPS = 5;
// Écart relatif |SCP − médiane| / médiane
const CROSS_CHECK_CONFIRM_PCT = 0.20;
const CROSS_CHECK_DIVERGE_PCT = 0.40;

/**
 * @typedef {{
 *   valueCad: number | null,
 *   source: "sold" | "asking" | "none",
 *   sampleSize: number,
 *   asOfIso: string,
 *   confidence: "high" | "medium" | "low",
 *   rangeCad?: { p25Cad: number, p75Cad: number } | null,
 *   lastSaleDate?: string | null,
 *   crossCheck?: { source: "sportscardspro", valueCad: number, deltaPct: number, verdict: "confirme" | "diverge" | "neutre" } | null,
 * }} MarketValue
 */

/**
 * Ajuste la confiance selon l'accord entre la médiane 130point et la
 * valeur SportsCardsPro. Pure, exportée pour testabilité.
 * @param {"high" | "medium" | "low"} confidence
 * @param {number} soldValueCad
 * @param {number | null | undefined} scpValueCad
 * @returns {{ confidence: "high" | "medium" | "low", crossCheck: MarketValue["crossCheck"] }}
 */
export function applyCrossCheck(confidence, soldValueCad, scpValueCad) {
  if (!Number.isFinite(scpValueCad) || scpValueCad <= 0 || !Number.isFinite(soldValueCad) || soldValueCad <= 0) {
    return { confidence, crossCheck: null };
  }
  const delta = Math.abs(scpValueCad - soldValueCad) / soldValueCad;
  const deltaPct = Math.round(delta * 100);
  if (delta <= CROSS_CHECK_CONFIRM_PCT) {
    return {
      confidence: "high",
      crossCheck: { source: "sportscardspro", valueCad: scpValueCad, deltaPct, verdict: "confirme" },
    };
  }
  if (delta >= CROSS_CHECK_DIVERGE_PCT) {
    const downgraded = confidence === "high" ? "medium" : "low";
    return {
      confidence: downgraded,
      crossCheck: { source: "sportscardspro", valueCad: scpValueCad, deltaPct, verdict: "diverge" },
    };
  }
  return {
    confidence,
    crossCheck: { source: "sportscardspro", valueCad: scpValueCad, deltaPct, verdict: "neutre" },
  };
}

/**
 * Résout la valeur marché d'une carte précise (une cohorte à la fois).
 * Fait un appel réseau 130point (via `getSoldPriceStats`, caché 24h) et un
 * cross-check SportsCardsPro (caché 7j, throttlé, disjoncté) — à utiliser
 * pour des lookups ponctuels (ex. /analyse, une carte à la fois), pas en
 * boucle sur des dizaines de cohortes (voir `normalizeFromFairMap` pour les
 * consommateurs qui traitent déjà un lot de cohortes en parallèle via
 * `enrichFairMapWith130Point`).
 *
 * @param {{
 *   query: string,                 // requête 130point (ex. fingerprint.searchQuery)
 *   sampleTitle?: string | null,   // titre d'annonce pour post-filtrer par fingerprint
 *   fallbackQuery?: string | null, // requête 130point élargie si la précise donne < 3 comps
 *   askingValueCad?: number | null,   // fallback déjà calculé par l'appelant
 *   askingSampleSize?: number,        // nb de comps derrière ce fallback
 * }} params
 * @returns {Promise<MarketValue>}
 */
export async function getMarketValue({
  query,
  sampleTitle = null,
  fallbackQuery = null,
  askingValueCad = null,
  askingSampleSize = 0,
}) {
  const asOfIso = new Date().toISOString();

  if (query) {
    const sold = await getSoldPriceStats(query, undefined, sampleTitle, { fallbackQuery });
    if (sold.source === "130point" && sold.medianCad != null && sold.count >= SOLD_MIN_COMPS) {
      let confidence =
        sold.count >= SOLD_HIGH_CONFIDENCE_COMPS ? "high" : "medium";
      let crossCheck = null;

      if (sampleTitle) {
        try {
          const scp = await getScpValueForCard(sampleTitle);
          const applied = applyCrossCheck(confidence, sold.medianCad, scp?.valueCad ?? null);
          confidence = applied.confidence;
          crossCheck = applied.crossCheck;
        } catch (err) {
          console.error("[marketValue] cross-check SCP failed:", err?.message ?? err);
        }
      }

      return {
        valueCad: sold.medianCad,
        source: "sold",
        sampleSize: sold.count,
        asOfIso,
        confidence,
        rangeCad: sold.rangeCad ?? null,
        lastSaleDate: sold.lastSaleDate ?? null,
        crossCheck,
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
      rangeCad: null,
      lastSaleDate: null,
      crossCheck: null,
    };
  }

  return {
    valueCad: null,
    source: "none",
    sampleSize: 0,
    asOfIso,
    confidence: "low",
    rangeCad: null,
    lastSaleDate: null,
    crossCheck: null,
  };
}

/**
 * Normalise une entrée déjà enrichie par `enrichFairMapWith130Point`
 * (dealFinder.js, auctionDeals.js) dans la forme canonique — sans
 * refaire le fetch, juste relabeliser ce qui a déjà été décidé.
 * @param {{ fairValueCad?: number | null, comps?: number, fairValueSource?: string | null, range130?: { p25Cad: number, p75Cad: number } | null, lastSale130?: string | null }} entry
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
      rangeCad: entry?.range130 ?? null,
      lastSaleDate: entry?.lastSale130 ?? null,
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
