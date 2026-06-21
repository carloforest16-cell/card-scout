import "./cinematic.css";
import "./home/home-cinematic.css";
import "./home-premium.css";

import HomeCinematic from "./home/HomeCinematic";

export const metadata = {
  title: "Card Metrics",
};

/**
 * Shell statique — le carrousel trending charge côté client via /api/trending
 * (lecture Blob < 300 ms sur Vercel). Aucun rebuild bloquant au SSR.
 */
export default function Home() {
  return <HomeCinematic />;
}
