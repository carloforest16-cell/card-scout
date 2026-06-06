import { getTopOpportunites } from "@/lib/opportunitesTop";

import HomeCinematic from "./HomeCinematic";

function tierFromScore(score) {
  const s = Number(score);
  if (s >= 7) return "high";
  if (s >= 5) return "mid";
  return "low";
}

/**
 * Carrousel home = mêmes joueurs que la page Opportunités (top AI score).
 * Lecture du cache Blob (14j TTL) — aucun calcul fait ici.
 */
export default async function HomeTrendingSection() {
  const result = await getTopOpportunites().catch(() => null);
  const opportunities = result?.ok ? result.opportunities : [];

  const carouselPlayers = (opportunities ?? [])
    .filter((o) => o?.playerId && o?.headshotUrl)
    .map((o) => ({
      id: String(o.playerId),
      name: o.playerName,
      team: o.team,
      headshotUrl: o.headshotUrl,
      score: Number(o.investmentScore) || 0,
      tier: tierFromScore(o.investmentScore),
      points: o.points ?? null,
    }));

  return <HomeCinematic carouselPlayers={carouselPlayers} />;
}
