import "../cinematic.css";
import "./backtest.css";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import ScrollProgress from "../components/ScrollProgress";

import BacktestClient from "./BacktestClient";

export const metadata = {
  title: "Backtest — Card Scout",
  description: "Le Card Scout Score a-t-il vraiment prédit les hausses de prix? Voici la transparence sur la valeur prédictive de notre algorithme.",
};

export default function BacktestPage() {
  return (
    <div className="bt-page cinematic">
      <ScrollProgress />
      <Atmosphere />

      <div className="pl-rail">
        <div className="pl-rail__inner">
          <AppNav active={null} />
        </div>
      </div>

      <main className="bt-main">
        <header className="bt-hero">
          <p className="cn-eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            CARD SCOUT · TRANSPARENCE
          </p>
          <h1 className="cn-h1">
            BACK<span className="cn-h1__ice">TEST</span>
          </h1>
          <p className="bt-hero__lead">
            Le Card Scout Score a-t-il vraiment prédit les hausses de prix? Voici les
            chiffres bruts. Pas de cherry-picking — toutes les prédictions, gagnantes
            comme perdantes.
          </p>
        </header>

        <BacktestClient />
      </main>
    </div>
  );
}
