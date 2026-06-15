import { Suspense } from "react";
import "../cinematic.css";
import "../components/price-history-chart.css";
import "./analyse.css";

import AnalyseClient from "./AnalyseClient";

export const metadata = {
  title: "Analyser une annonce — Card Scout",
  description:
    "Colle une annonce eBay : l'IA évalue le joueur, le type de carte, le prix vs la cote du marché et les alternatives moins chères.",
};

export default function AnalysePage() {
  return (
    <Suspense>
      <AnalyseClient />
    </Suspense>
  );
}
