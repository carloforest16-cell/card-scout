"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const MONTH_OPTIONS = [1, 3, 6];

function ScatterPlot({ data }) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const w = 600;
  const h = 360;
  const padding = 50;

  const scores = data.map((d) => d.scoreAtT);
  const changes = data.map((d) => d.priceChangePct);

  const xMin = 0;
  const xMax = 10;
  const yMin = Math.min(-30, Math.floor(Math.min(...changes) / 10) * 10);
  const yMax = Math.max(30, Math.ceil(Math.max(...changes) / 10) * 10);
  const yRange = yMax - yMin;

  function x(score) {
    return padding + ((score - xMin) / (xMax - xMin)) * (w - 2 * padding);
  }
  function y(change) {
    return h - padding - ((change - yMin) / yRange) * (h - 2 * padding);
  }

  // Ligne y=0
  const zeroY = y(0);

  // Grille axes
  const xTicks = [0, 2, 4, 6, 8, 10];
  const yTicks = [];
  for (let v = Math.ceil(yMin / 20) * 20; v <= yMax; v += 20) yTicks.push(v);

  return (
    <div className="bt-chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} className="bt-chart" preserveAspectRatio="xMidYMid meet">
        {/* Background */}
        <rect x="0" y="0" width={w} height={h} fill="transparent" />

        {/* Quadrants annotés */}
        <text x={x(8.5)} y={y(yMax) + 16} className="bt-quad-label bt-quad-label--good" textAnchor="middle">
          Prédictions justes
        </text>
        <text x={x(8.5)} y={y(yMin) - 8} className="bt-quad-label bt-quad-label--miss" textAnchor="middle">
          Mauvaises hausses
        </text>

        {/* Ligne y=0 */}
        <line
          x1={padding}
          y1={zeroY}
          x2={w - padding}
          y2={zeroY}
          stroke="rgba(255,255,255,0.2)"
          strokeDasharray="3 3"
        />

        {/* Ligne x=7 (seuil "Acheter") */}
        <line
          x1={x(7)}
          y1={padding}
          x2={x(7)}
          y2={h - padding}
          stroke="rgba(110, 138, 255, 0.3)"
          strokeDasharray="3 3"
        />

        {/* Ticks X */}
        {xTicks.map((t) => (
          <g key={`x-${t}`}>
            <line x1={x(t)} y1={h - padding} x2={x(t)} y2={h - padding + 5} stroke="rgba(255,255,255,0.4)" />
            <text x={x(t)} y={h - padding + 18} className="bt-tick" textAnchor="middle">{t}</text>
          </g>
        ))}
        {/* Ticks Y */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line x1={padding - 5} y1={y(t)} x2={padding} y2={y(t)} stroke="rgba(255,255,255,0.4)" />
            <text x={padding - 10} y={y(t) + 4} className="bt-tick" textAnchor="end">{t > 0 ? `+${t}` : t}%</text>
          </g>
        ))}

        {/* Axes labels */}
        <text x={w / 2} y={h - 5} className="bt-axis-label" textAnchor="middle">
          Card Scout Score au moment T
        </text>
        <text x={15} y={h / 2} className="bt-axis-label" textAnchor="middle" transform={`rotate(-90 15 ${h / 2})`}>
          % de changement de prix subséquent
        </text>

        {/* Points */}
        {data.map((d, i) => {
          const correct = (d.scoreAtT >= 7 && d.priceChangePct > 0) || (d.scoreAtT < 7 && d.priceChangePct <= 0);
          return (
            <circle
              key={`${d.playerId}-${i}`}
              cx={x(d.scoreAtT)}
              cy={y(d.priceChangePct)}
              r="5"
              className={`bt-point${correct ? " bt-point--correct" : " bt-point--wrong"}`}
            >
              <title>{`${d.playerName} — score ${d.scoreAtT.toFixed(1)} → ${d.priceChangePct > 0 ? "+" : ""}${d.priceChangePct.toFixed(1)}%`}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

function correlationLabel(r) {
  if (r == null) return { text: "—", className: "" };
  const abs = Math.abs(r);
  if (abs >= 0.7) return { text: "Très fort", className: "bt-corr--great" };
  if (abs >= 0.5) return { text: "Fort", className: "bt-corr--good" };
  if (abs >= 0.3) return { text: "Modéré", className: "bt-corr--ok" };
  if (abs >= 0.15) return { text: "Faible", className: "bt-corr--weak" };
  return { text: "Quasi nul", className: "bt-corr--bad" };
}

export default function BacktestClient() {
  const [months, setMonths] = useState(3);
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null });
    fetch(`/api/backtest?months=${months}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d?.ok) {
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
  }, [months]);

  return (
    <>
      <div className="bt-controls">
        <span className="bt-controls__label">Fenêtre :</span>
        {MONTH_OPTIONS.map((m) => (
          <button
            key={m}
            type="button"
            className={`bt-control-btn${months === m ? " bt-control-btn--active" : ""}`}
            onClick={() => setMonths(m)}
            disabled={state.loading}
          >
            {m} mois
          </button>
        ))}
      </div>

      {state.loading && (
        <div className="bt-card bt-card--skeleton" aria-hidden>
          <div className="bt-skel" />
          <div className="bt-skel bt-skel--tall" />
        </div>
      )}

      {!state.loading && state.data && state.data.sampleSize === 0 && (
        <div className="bt-empty">
          <h2>Collecte de données en cours</h2>
          <p>{state.data.message ?? "Reviens dans quelques semaines pour les premiers résultats."}</p>
        </div>
      )}

      {!state.loading && state.data && state.data.sampleSize > 0 && (
        <>
          <section className="bt-stats">
            <div className="bt-stat">
              <span className="bt-stat__label">Échantillon</span>
              <span className="bt-stat__value">{state.data.sampleSize}</span>
              <span className="bt-stat__unit">joueurs</span>
            </div>
            <div className="bt-stat">
              <span className="bt-stat__label">Corrélation Pearson</span>
              <span className={`bt-stat__value ${correlationLabel(state.data.correlation).className}`}>
                {state.data.correlation != null ? state.data.correlation.toFixed(2) : "—"}
              </span>
              <span className="bt-stat__unit">
                {correlationLabel(state.data.correlation).text}
              </span>
            </div>
            {state.data.buyHitRate != null && (
              <div className="bt-stat">
                <span className="bt-stat__label">Signaux d&apos;achat gagnants</span>
                <span className="bt-stat__value">{state.data.buyHitRate}%</span>
                <span className="bt-stat__unit">{state.data.buyCount} signaux</span>
              </div>
            )}
          </section>

          <section className="bt-card">
            <h2 className="bt-card__title">Score vs performance de prix</h2>
            <p className="bt-card__sub">
              Chaque point = un joueur. Axe X = son score au moment T (il y a {months} mois).
              Axe Y = changement du prix médian de ses cartes depuis. Points verts = bonne
              prédiction, rouges = manqué.
            </p>
            <ScatterPlot data={state.data.scatterData ?? []} />
          </section>

          {Array.isArray(state.data.topPredictions) && state.data.topPredictions.length > 0 && (
            <section className="bt-card">
              <h2 className="bt-card__title">Meilleures prédictions</h2>
              <PredictionTable rows={state.data.topPredictions} />
            </section>
          )}

          {Array.isArray(state.data.worstMisses) && state.data.worstMisses.length > 0 && (
            <section className="bt-card">
              <h2 className="bt-card__title">Pires ratés</h2>
              <p className="bt-card__sub">Transparence — voici où l&apos;algo s&apos;est trompé.</p>
              <PredictionTable rows={state.data.worstMisses} negative />
            </section>
          )}
        </>
      )}
    </>
  );
}

function PredictionTable({ rows, negative = false }) {
  return (
    <div className="bt-table">
      <div className="bt-table__head">
        <span>Joueur</span>
        <span>Score à T</span>
        <span>Prix initial</span>
        <span>Prix actuel</span>
        <span>Variation</span>
      </div>
      {rows.map((r, i) => {
        const positive = r.priceChangePct > 0;
        const cls = positive ? "bt-row__delta--up" : "bt-row__delta--down";
        return (
          <Link href={`/player/${r.playerId}`} key={`${r.playerId}-${i}`} className="bt-row">
            <span className="bt-row__name">{r.playerName}</span>
            <span className="bt-row__score">{r.scoreAtT.toFixed(1)}</span>
            <span className="bt-row__price">{r.oldPrice ? `$${r.oldPrice}` : "—"}</span>
            <span className="bt-row__price">{r.newPrice ? `$${r.newPrice}` : "—"}</span>
            <span className={`bt-row__delta ${cls}`}>
              {positive ? "+" : ""}{r.priceChangePct.toFixed(1)}%
            </span>
          </Link>
        );
      })}
    </div>
  );
}
