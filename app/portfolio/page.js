import "../cinematic.css";
import "./portfolio.css";
import PortfolioClient from "./PortfolioClient";

export const metadata = {
  title: "Mon Vault",
  description: "Suis la valeur de ta collection de cartes NHL — P&L en temps réel, coach IA et signaux de vente.",
  openGraph: {
    title: "Mon Vault — Card Scout",
    description: "Portfolio de cartes NHL avec P&L, coach IA et signaux de vente.",
  },
};

export default function PortfolioPage() {
  return <PortfolioClient />;
}
