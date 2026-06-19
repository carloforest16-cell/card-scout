"use client";

import { useEffect, useState } from "react";

import "./score-change-explainer.css";

const FACTOR_LABELS = {
  performance: "Performance",
  momentum: "Momentum",
  momentumDetailed: "Accélération",
  age: "Âge",
  marketValue: "Marché",
  liquidity: "Liquidité",
  upside: "Upside",
  hype: "Hype",
  marketDiscrepancy: "Discrépance",
  risk: "Risque",
  teamContext: "Équipe",
  catalysts: "Catalyseurs",
};

/**
 * Mini sparkline SVG du score sur la fenêtre.
 * @param {{ data: Array<{ date: string; score: number }> }} props
 */
function Sparkline({ data }) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const w = 140;
  const h = 30;
  const padding = 2;
  const scores = data.map((d) => d.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = Math.max(0.5, max - min);

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (w - 2 * padding);
    const y = h - padding - ((d.score - min) / range) * (h - 2 * padding);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const last = data[data.length - 1];
  const first = data[0];
  const rising = last.score >= first.score;
  const color = rising ? "rgba(101, 215, 132, 1)" : "rgba(245, 130, 130, 1)";

  return (
    <svg className="sce-sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * @param {{ playerId: string; days?: number }} props
 */
export default function ScoreChangeExplainer({ playerId, days = 14 }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    fetch(`/api/score/explain?playerId=${encodeURIComponent(playerId)}&days=${days}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.ok) {
          setState({ loading: false, data: null, error: d?.error ?? "Erreur" });
          return;
        }
        setState({ loading: false, data: d, error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, data: null, error: "Erreur réseau" });
      });
    return () => {
      cancelled = true;
    };
  }, [playerId, days]);

  if (state.loading) {
    return (
      <div className="sce-card sce-card--skeleton" aria-hidden>
        <div className="sce-skel-row" />
        <div className="sce-skel-row sce-skel-row--short" />
      </div>
    );
  }

  if (state.error || !state.data) {
    return null; // pas de score → pas de bloc
  }

  const { delta, oldScore, newScore, explanation, changedFactors, sparkline } = state.data;
  if (delta == null && (!sparkline || sparkline.length < 2)) {
    return null; // pas d'historique
  }

  const deltaSign = delta != null ? (delta > 0 ? "+" : delta < 0 ? "" : "") : "";
  const deltaClass = delta == null
    ? "sce-delta--neutral"
    : delta > 0.5
      ? "sce-delta--up"
      : delta < -0.5
        ? "sce-delta--down"
        : "sce-delta--neutral";

  return (
    <div className="sce-card">
      <div className="sce-header">
        <div className="sce-header__left">
          <div className="sce-title">Évolution du score</div>
          <div className="sce-window">{days} derniers jours</div>
        </div>
        <div className="sce-header__right">
          <Sparkline data={sparkline ?? []} />
          {delta != null && (
            <div className={`sce-delta ${deltaClass}`}>
              {deltaSign}
              {delta.toFixed(1)}
            </div>
          )}
        </div>
      </div>

      <p className="sce-explanation">{explanation}</p>

      {Array.isArray(changedFactors) && changedFactors.length > 0 && (
        <>
          <button
            type="button"
            className="sce-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? "Masquer les détails" : "Voir les facteurs qui ont changé"}
          </button>
          {expanded && (
            <ul className="sce-factor-list">
              {changedFactors.map((f) => {
                const label = FACTOR_LABELS[f.key] ?? f.key;
                const sign = f.diff > 0 ? "+" : "";
                const cls = f.diff > 0 ? "sce-factor-diff--up" : "sce-factor-diff--down";
                return (
                  <li key={f.key} className="sce-factor">
                    <span className="sce-factor-label">{label}</span>
                    <span className="sce-factor-values">
                      {f.oldValue} → {f.newValue}
                    </span>
                    <span className={`sce-factor-diff ${cls}`}>
                      {sign}
                      {f.diff.toFixed(1)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
