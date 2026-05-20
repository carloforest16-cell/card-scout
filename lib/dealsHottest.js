import "server-only";

import {
  buildInvestmentIntelligenceFromListings,
  fetchEbayHockeyCardListingsForPlayer,
} from "@/lib/dealFinder";
import { resolveEbayBearerToken } from "@/lib/ebayServer";
import { fetchPlayerLanding, resolveFullName } from "@/lib/nhlPlayerLanding";
import { TRENDING_PLAYER_IDS } from "@/lib/trendingData";

export const HOTTEST_MIN_INVESTMENT_SCORE = 8.5;
export const HOTTEST_MAX_CARDS = 6;

/**
 * Démo sans eBay : cartes fictives ≥ 8.5 pour remplir la section.
 * @returns {Array<object>}
 */
function buildMockHottestCards() {
  const labels = [
    "Connor McDavid",
    "Sidney Crosby",
    "Nathan MacKinnon",
    "Leon Draisaitl",
    "Cole Caufield",
    "Brad Marchand",
  ];
  return labels.map((playerName, i) => ({
    listingIndex: i,
    title: `${playerName} — Young Guns RC (exemple démo)`,
    price: 72 + i * 4,
    percentOfMarket: 81 + i,
    url: "https://www.ebay.ca",
    imageUrl: null,
    groupType: "⭐ Young Guns",
    marketPrice: 95 + i * 5,
    priceConfidence: "high",
    investmentScore: 8.5 + i * 0.08,
    holdTimeline: "2–3 saisons",
    upside: "Fort",
    verdict: "Acheter",
    reason: "Démo — branche eBay + Anthropic pour du live.",
    scoreSource: "demo",
    playerName,
    playerId: String(TRENDING_PLAYER_IDS[i] ?? i),
  }));
}

/**
 * Agrège les stars NHL : eBay + scores en parallèle, filtre ≥ 8.5, top 6.
 * @returns {Promise<{ ok: true; mocked: boolean; cards: object[]; playersResolved?: number } | { ok: false; error: string }>}
 */
export async function buildHottestDealsPayload() {
  const token = await resolveEbayBearerToken();
  if (!token) {
    return {
      ok: true,
      mocked: true,
      cards: buildMockHottestCards(),
      playersResolved: TRENDING_PLAYER_IDS.length,
    };
  }

  const marketplaceId =
    process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const rows = await Promise.all(
    TRENDING_PLAYER_IDS.map(async (id) => {
      const data = await fetchPlayerLanding(id);
      if (!data) return null;
      const playerName = resolveFullName(data).trim();
      if (!playerName) return null;
      return { id: String(id), playerName };
    })
  );
  const players = rows.filter(Boolean);

  const perPlayer = await Promise.all(
    players.map(async (p) => {
      const ebay = await fetchEbayHockeyCardListingsForPlayer(
        p.playerName,
        token,
        marketplaceId
      );
      if (!ebay.ok || !ebay.listings.length) return [];
      const intel = await buildInvestmentIntelligenceFromListings(
        p.playerName,
        ebay.listings,
        ebay.totalListings,
        false
      );
      if (!intel.ok || !intel.data?.listings?.length) return [];
      return intel.data.listings.map((L) => ({
        ...L,
        playerName: p.playerName,
        playerId: p.id,
      }));
    })
  );

  const merged = perPlayer.flat();
  const cards = merged
    .filter(
      (c) =>
        Number(c.investmentScore) >= HOTTEST_MIN_INVESTMENT_SCORE &&
        (c.priceConfidence === "high" || c.priceConfidence === "medium")
    )
    .sort((a, b) => Number(b.investmentScore) - Number(a.investmentScore))
    .slice(0, HOTTEST_MAX_CARDS);

  return {
    ok: true,
    mocked: false,
    cards,
    playersResolved: players.length,
  };
}
