import { getTopOpportunites } from "@/lib/opportunitesTop";

import HomeCinematic from "./HomeCinematic";

function tierFromScore(score) {
  const s = Number(score);
  if (s >= 7) return "high";
  if (s >= 5) return "mid";
  return "low";
}

// L'URL NHL mugs exige l'abbréviation d'équipe, sinon 302 → photo cassée.
// On reconstruit ici pour ne pas dépendre du headshotUrl du cache (potentiellement périmé).
function headshotFor(o) {
  if (o.team && o.team !== "—") {
    return `https://assets.nhle.com/mugs/nhl/20252026/${o.team}/${o.playerId}.png`;
  }
  return o.headshotUrl;
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
      headshotUrl: headshotFor(o),
      score: Number(o.investmentScore) || 0,
      tier: tierFromScore(o.investmentScore),
      points: o.points ?? null,
    }));

  return <HomeCinematic carouselPlayers={carouselPlayers} />;
}
