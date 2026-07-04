import { Suspense } from "react";
import "../cinematic.css";
import "../components/empty-state.css";
import "./deals.css";

import DealFinderClient from "./DealFinderClient";

export const metadata = {
  title: "Deal Finder",
  description: "Trouve les cartes NHL sous-évaluées sur eBay avec des scores d'investissement IA en temps réel.",
  openGraph: {
    title: "Deal Finder — Card Metrics",
    description: "Analyse eBay · Scores IA · Cartes NHL sous-évaluées",
  },
};

export default function DealsPage() {
  return (
    <Suspense>
      <DealFinderClient />
    </Suspense>
  );
}
