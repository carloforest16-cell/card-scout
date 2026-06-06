import { buildTrendingPayload } from "@/lib/trendingData";

import HomeCinematic from "./HomeCinematic";

/**
 * Charge le carrousel trending en streaming (Suspense) pour que le shell de la
 * page d'accueil s'affiche immédiatement sans attendre le build NHL.
 */
export default async function HomeTrendingSection() {
  const trending = await buildTrendingPayload();
  return (
    <HomeCinematic carouselPlayers={trending.carouselPlayers ?? []} />
  );
}
