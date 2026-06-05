import "./cinematic.css";
import "./home/home-cinematic.css";
import "./home-premium.css";

import { buildTrendingPayload } from "@/lib/trendingData";

import HomeCinematic from "./home/HomeCinematic";

export default async function Home() {
  const trending = await buildTrendingPayload();

  return <HomeCinematic carouselPlayers={trending.carouselPlayers ?? []} />;
}
