import "../cinematic.css";
import "./opportunites.css";

import OpportunitesClient from "./OpportunitesClient";

export const metadata = {
  title: "Opportunités",
  description: "Top 10 opportunités d'investissement en cartes NHL analysées par IA — mises à jour régulièrement.",
  openGraph: {
    title: "Opportunités — Card Metrics",
    description: "Top 10 cartes NHL à fort potentiel selon l'IA",
  },
};

export default function OpportunitesPage() {
  return <OpportunitesClient />;
}
