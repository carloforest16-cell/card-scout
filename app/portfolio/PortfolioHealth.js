"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import "./portfolio-health.css";

const HEALTH_LABELS = [
  { min: 80, label: "Excellent", className: "phs-tier--great" },
  { min: 65, label: "Solide", className: "phs-tier--good" },
  { min: 45, label: "Moyen", className: "phs-tier--ok" },
  { min: 0, label: "À optimiser", className: "phs-tier--bad" },
];

function tierFromScore(score) {
  for (const t of HEALTH_LABELS) {
    if (score >= t.min) return t;
  }
  return HEALTH_LABELS[HEALTH_LABELS.length - 1];
}

/**
 * Composant client autonome qui récupère son propre Health Score.
 */
export default function PortfolioHealth() {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null });
    fetch("/api/portfolio/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.ok || d?.healthScore == null) {
          setState({ loading: false, data: null });
          return;
        }
        setState({ loading: false, data: d });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <div className="phs-card phs-card--skeleton" aria-hidden>
        <div className="phs-skel" />
        <div className="phs-skel phs-skel--short" />
      </div>
    );
  }

  if (!state.data) return null;

  const { healthScore, breakdown, swapSuggestions } = state.data;
  const tier = tierFromScore(healthScore);
  const dasharray = (healthScore / 100) * 251.2;

  return (
    <section className="phs-card">
      <header className="phs-header">
        <div className="phs-title-block">
          <h2 className="phs-title">Santé du portfolio</h2>
          <p className="phs-subtitle">Évalue diversification, momentum et concentration de tes cartes.</p>
        </div>
        <div className="phs-gauge">
          <svg viewBox="0 0 100 100" width="84" height="84" aria-hidden>
            <circle cx="50" cy="50" r="40" className="phs-gauge__track" />
            <circle
              cx="50"
              cy="50"
              r="40"
              className={`phs-gauge__fill ${tier.className}`}
              strokeDasharray={`${dasharray} 251.2`}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="phs-gauge__center">
            <span className="phs-gauge__score">{healthScore}</span>
            <span className="phs-gauge__suffix">/100</span>
          </div>
        </div>
      </header>

      <div className={`phs-tier ${tier.className}`}>{tier.label}</div>

      <ul className="phs-breakdown">
        <li>
          <span>Score moyen</span>
          <strong>{breakdown.avgScore.toFixed(1)}/10</strong>
        </li>
        <li>
          <span>Joueurs uniques</span>
          <strong>{breakdown.uniquePlayers}</strong>
        </li>
        <li>
          <span>Positions</span>
          <strong>{breakdown.uniquePositions}</strong>
        </li>
        <li>
          <span>Tendance (14j)</span>
          <strong>
            <span className="phs-rising">↑{breakdown.risingCount}</span>
            {" / "}
            <span className="phs-falling">↓{breakdown.fallingCount}</span>
          </strong>
        </li>
        <li>
          <span>Concentration max</span>
          <strong>{breakdown.maxConcentrationPct.toFixed(1)}%</strong>
        </li>
      </ul>

      {Array.isArray(swapSuggestions) && swapSuggestions.length > 0 && (
        <div className="phs-swaps">
          <h3 className="phs-swaps__title">Suggestions de swap</h3>
          <ul>
            {swapSuggestions.map((s, i) => (
              <li key={i} className="phs-swap">
                <div className="phs-swap__from">
                  <div className="phs-swap__player">{s.from.playerName}</div>
                  <div className="phs-swap__meta">
                    {s.from.cardType} · score {s.from.currentScore}
                  </div>
                </div>
                <div className="phs-swap__arrow" aria-hidden>→</div>
                <div className="phs-swap__to">
                  <Link href={`/player/${s.to.playerId}`} className="phs-swap__player">
                    {s.to.playerName}
                  </Link>
                  <div className="phs-swap__meta">
                    {s.to.team ?? ""} · score {Number(s.to.score).toFixed(1)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
