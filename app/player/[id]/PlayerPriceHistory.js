"use client";

import PriceHistoryChart from "@/components/PriceHistoryChart";

export default function PlayerPriceHistory({ playerName }) {
  if (!playerName) return null;
  return (
    <section className="pl-price-history">
      <h2 className="cn-h2 pl-price-history__title">
        Tendance des prix
      </h2>
      <p className="cn-body pl-price-history__sub">
        Évolution de la cote médiane sur les 12 derniers mois.
      </p>
      <PriceHistoryChart playerName={playerName} months={12} />
    </section>
  );
}
