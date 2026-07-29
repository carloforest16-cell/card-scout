import "server-only";

import {
  fetchEbayHockeyCardListingsForPlayer,
  computeFairValueByFingerprint,
  cohortKeyForTitle,
  detectCardGroup,
} from "@/lib/dealFinder";
import { mockInvestmentScores, applyPlayerQualityCap } from "@/lib/dealInvestmentScore";
import { titleMatchesPlayer } from "@/lib/titleFilters";

// Types de carte qui S'APPRÉCIENT (hiérarchie d'investissement). Le reste
// (base, parallèles communs, « autres ») n'est pas un actif à recommander.
const APPRECIATING_RE =
  /Young Guns|Auto|RPA|Gradée|Numéroté|The Cup|SPx|Premier|Allure|Canvas|Clear Cut|OPC Plat/i;

// Plancher de prix : sous ce seuil, ce n'est pas un « investissement » (une
// carte à 3 $ ne se revend pas avec profit après frais). Réglé conservateur.
const MIN_INVESTMENT_PRICE_CAD = 15;

// Comps minimum pour une cote d'annonces active FIABLE (aligné dealFinder).
const MIN_COTE_COMPS = 4;

// Bande de prix « juste » vs cote : on ne surpaie pas (> 110 %) et on écarte les
// outliers trop bas (< 55 % = carte abîmée / mauvaise variante, cf. spike P0).
const MAX_PCT_OF_MARKET = 110;
const MIN_PCT_OF_MARKET = 55;

/**
 * @param {{ score?: number | null }} player
 */
function buildPlayerContext(player) {
  return {
    fullName: player.name ?? null,
    cardMetricsScore: player.score ?? null,
    ageYears: null,
    pointsPerGame: null,
  };
}

/**
 * Scan « investissement » d'un joueur (PLAN-OPPORTUNITY-ENGINE.md, Phase 2).
 * Ne renvoie que des cartes de TYPE qui s'apprécie, à cote active FIABLE, au
 * prix du marché ou en dessous (bande juste), au-dessus du plancher de prix.
 * Score HEURISTIQUE (pas de DeepSeek — coût maîtrisé ; DeepSeek réservé au top N
 * final par l'agrégateur). Cotes actives uniquement (rapide, 130point en bonus
 * ailleurs).
 *
 * @param {{ id: string; name: string; score?: number|null; team?: string|null }} player
 * @param {string} token
 * @param {string} marketplaceId
 * @returns {Promise<Array<object>>} cartes scorées, prêtes pour la vitrine
 */
export async function scanPlayerInvestments(player, token, marketplaceId) {
  const name = String(player?.name ?? "").trim();
  if (!name) return [];

  const ebay = await fetchEbayHockeyCardListingsForPlayer(name, token, marketplaceId);
  if (!ebay.ok || !ebay.listings.length) return [];

  const fairMap = computeFairValueByFingerprint(ebay.listings, name);

  // Meilleure annonce ACHETABLE par cohorte : la moins chère DANS la bande juste
  // (ni outlier trop bas, ni surpayée). Une seule par cohorte → pas de doublons.
  /** @type {Map<string, { listing: object; fv: object; group: string; pct: number }>} */
  const bestByCohort = new Map();
  for (const listing of ebay.listings) {
    // La recherche floue eBay renvoie parfois la carte d'un AUTRE joueur → elle
    // s'afficherait avec le score de CE joueur (faux). titleMatchesPlayer gère
    // accents (Stützle↔Stutzle) et frères (Hughes).
    if (!titleMatchesPlayer(name, listing.title)) continue;
    const price = Number(listing.priceCad);
    if (!Number.isFinite(price) || price < MIN_INVESTMENT_PRICE_CAD) continue;
    const group = detectCardGroup(listing.title) ?? "";
    if (!APPRECIATING_RE.test(group)) continue;
    const key = cohortKeyForTitle(listing.title, name);
    const fv = key ? fairMap.get(key) : null;
    if (!fv || fv.fairValueCad == null || Number(fv.comps) < MIN_COTE_COMPS) continue;
    const pct = Math.round((price / fv.fairValueCad) * 100);
    if (pct > MAX_PCT_OF_MARKET || pct < MIN_PCT_OF_MARKET) continue;
    const existing = bestByCohort.get(key);
    if (!existing || price < Number(existing.listing.priceCad)) {
      bestByCohort.set(key, { listing, fv, group, pct });
    }
  }
  if (bestByCohort.size === 0) return [];

  const rows = [...bestByCohort.values()].map(({ listing, fv, group, pct }, i) => ({
    listingIndex: i,
    title: listing.title,
    price: Number(listing.priceCad),
    url: listing.url ?? null,
    imageUrl: listing.imageUrl ?? null,
    groupType: group,
    groupDisplayName: group,
    fairValueCad: fv.fairValueCad,
    marketPrice: fv.fairValueCad,
    percentOfMarket: pct,
    dealDeltaPct: pct - 100,
    fairValueConfidence: fv.confidence ?? "low",
    fairValueComps: Number(fv.comps) || 0,
    fairValueSource: null, // cotes actives ; 130point ajouté en bonus ailleurs
    referenceValueCad: null,
  }));

  const playerContext = buildPlayerContext(player);
  const heuristics = mockInvestmentScores(rows, playerContext);
  const byIdx = new Map(heuristics.map((h) => [h.listingIndex, h]));

  return rows.map((r) => {
    const h = byIdx.get(r.listingIndex);
    return applyPlayerQualityCap(
      {
        ...r,
        investmentScore: h?.investmentScore ?? 5,
        holdTimeline: h?.holdTimeline ?? "—",
        upside: h?.upside ?? "Moyen",
        verdict: h?.verdict ?? "Chercher mieux",
        reason: h?.reason ?? "—",
        scoreSource: "heuristic",
        playerName: name,
        playerId: player.id ?? null,
        cardScoutScore: player.score ?? null,
        teamAbbrev: player.team ?? null,
      },
      playerContext
    );
  });
}
