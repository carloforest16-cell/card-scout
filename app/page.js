import "./home-premium.css";

import { getDealFinderResult } from "@/lib/dealFinder";
import { buildTrendingPayload } from "@/lib/trendingData";

import {
  HomePremiumBentoFeatures,
  HomePremiumDealFinder,
  HomePremiumFooter,
  HomePremiumHero,
  HomePremiumNav,
  HomePremiumScoreSection,
  HomePremiumStatsBar,
} from "./home/HomePremium";

export default async function Home() {
  const trending = await buildTrendingPayload();
  const caufieldDeals = await getDealFinderResult("Cole Caufield");
  const dealPreview = caufieldDeals.ok ? caufieldDeals.data : null;

  return (
    <main className="home home--premium">
      <HomePremiumNav />
      <HomePremiumHero carouselPlayers={trending.carouselPlayers} />
      <HomePremiumStatsBar />
      <HomePremiumBentoFeatures />
      <HomePremiumScoreSection />
      <HomePremiumDealFinder dealPreview={dealPreview} />
      <HomePremiumFooter />
    </main>
  );
}
