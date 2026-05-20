import "./home-premium.css";

import { getDealFinderResult } from "@/lib/dealFinder";
import { buildTrendingPayload } from "@/lib/trendingData";

import {
  HomeHowSection,
} from "./HomePageSections";
import {
  HomePremiumAiFinder,
  HomePremiumDealFinder,
  HomePremiumFooter,
  HomePremiumHero,
  HomePremiumNav,
  HomePremiumScoreSection,
  HomePremiumStatsBar,
  HomePremiumTrending,
} from "./home/HomePremium";

export default async function Home() {
  const trending = await buildTrendingPayload();
  const caufieldDeals = await getDealFinderResult("Cole Caufield");
  const dealPreview = caufieldDeals.ok ? caufieldDeals.data : null;

  return (
    <main className="home home--premium">
      <HomePremiumNav />
      <HomePremiumHero carouselPlayers={trending.carouselPlayers} />
      <HomePremiumScoreSection />
      <HomePremiumStatsBar />
      <HomePremiumDealFinder dealPreview={dealPreview} />
      <HomePremiumAiFinder
        steals={trending.steals}
        stealsUsedPrice={trending.stealsUsedPrice}
      />
      <HomePremiumTrending hot={trending.hot} />
      <HomeHowSection premium />
      <HomePremiumFooter />
    </main>
  );
}
