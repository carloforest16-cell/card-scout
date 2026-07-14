import "../cinematic.css";
import "./encheres.css";

import EncheresClient from "./EncheresClient";

export const metadata = {
  title: "Enchères chaudes",
  description: "Enchères eBay qui finissent dans moins de 24h avec un prix sous la cote du marché.",
  openGraph: {
    title: "Enchères chaudes — Card Metrics",
    description: "Les meilleures enchères eBay qui finissent bientôt, scorées vs la cote du marché.",
  },
};

export default function EncheresPage() {
  return <EncheresClient />;
}
