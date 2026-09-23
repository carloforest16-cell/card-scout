"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const HORIZON_OPTIONS = [
  { days: 30, label: "1 mois" },
  { days: 60, label: "2 mois" },
  { days: 90, label: "3 mois" },
];

const TIER_LABEL = { low: "Scores bas", mid: "Scores moyens", high: "Scores élevés" };

function signedPct(v) {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)} %`;
}

function ScatterPlot({ data }) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const w = 600;
  const h = 360;
  const padding = 50;

  const scores = data.map((d) => d.scoreAtT);
  const changes = data.map((d) => d.priceChangePct);

  const xMin = Math.max(0, Math.floor(Math.min(...scores)) - 1);
  const xMax = Math.min(10, Math.ceil(Math.max(...scores)) + 1);
  const yMin = Math.min(-30, Math.floor(Math.min(...changes) / 10) * 10);
  const yMax = Math.max(30, Math.ceil(Math.max(...changes) / 10) * 10);
  const yRange = yMax - yMin;

  const x = (score) => padding + ((score - xMin) / (xMax - xMin)) * (w - 2 * padding);
  const y = (change) => h - padding - ((change - yMin) / yRange) * (h - 2 * padding);

  const xTicks = [];
  for (let t = xMin; t <= xMax; t++) xTicks.push(t);
  const yTicks = [];
  for (let v = Math.ceil(yMin / 20) * 20; v <= yMax; v += 20) yTicks.push(v);

  return (
    <div className="bt-chart-wrap">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="bt-chart"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Nuage de points : score au moment T contre variation du prix des mêmes cartes depuis"
      >
        <line x1={padding} y1={y(0)} x2={w - padding} y2={y(0)} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />

        {xTicks.map((t) => (
          <g key={`x-${t}`}>
            <line x1={x(t)} y1={h - padding} x2={x(t)} y2={h - padding + 5} stroke="rgba(255,255,255,0.4)" />
            <text x={x(t)} y={h - padding + 18} className="bt-tick" textAnchor="middle">{t}</text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line x1={padding - 5} y1={y(t)} x2={padding} y2={y(t)} stroke="rgba(255,255,255,0.4)" />
            <text x={padding - 10} y={y(t) + 4} className="bt-tick" textAnchor="end">{t > 0 ? `+${t}` : t}%</text>
          </g>
        ))}

        <text x={w / 2} y={h - 5} className="bt-axis-label" textAnchor="middle">
          Card Metrics Score au moment T
        </text>
        <text x={15} y={h / 2} className="bt-axis-label" textAnchor="middle" transform={`rotate(-90 15 ${h / 2})`}>
          Variation du prix des mêmes cartes
        </text>

        {data.map((d) => (
          <circle
            key={d.playerId}
            cx={x(d.scoreAtT)}
            cy={y(d.priceChangePct)}
            r="5"
            className={`bt-point bt-point--${d.tier}`}
          >
            <title>{`${d.playerName} — score ${d.scoreAtT.toFixed(1)} → ${signedPct(d.priceChangePct)} (${d.cohorts} carte${d.cohorts > 1 ? "s" : ""} comparée${d.cohorts > 1 ? "s" : ""})`}</title>
          </circle>
        ))}
      </svg>
      <ul className="bt-legend" aria-hidden>
        {["low", "mid", "high"].map((k) => (
          <li key={k}>
            <span className={`bt-legend__dot bt-point--${k}`} />
            {TIER_LABEL[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function spearmanLabel(r) {
  if (r == null) return { text: "—", className: "" };
  const abs = Math.abs(r);
  const dir = r < 0 ? " (inverse)" : "";
  if (abs >= 0.5) return { text: `Fort${dir}`, className: r > 0 ? "bt-corr--great" : "bt-corr--bad" };
  if (abs >= 0.3) return { text: `Modéré${dir}`, className: r > 0 ? "bt-corr--good" : "bt-corr--weak" };
  if (abs >= 0.15) return { text: `Faible${dir}`, className: "bt-corr--ok" };
  return { text: "Quasi nul", className: "bt-corr--weak" };
}

export default function BacktestClient() {
  const [days, setDays] = useState(60);
  const [state, setState] = useState({ loading: true, data: null, error: false });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: false });
    fetch(`/api/backtest?days=${days}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setState({ loading: false, data: d?.ok ? d : null, error: !d?.ok });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, data: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const d = state.data;
  const hasDetail = d && Array.isArray(d.points);

  return (
    <>
      <div className="bt-controls" role="group" aria-label="Fenêtre du backtest">
        <span className="bt-controls__label">Il y a :</span>
        {HORIZON_OPTIONS.map((o) => (
          <button
            key={o.days}
            type="button"
            className={`bt-control-btn${days === o.days ? " bt-control-btn--active" : ""}`}
            onClick={() => setDays(o.days)}
            disabled={state.loading}
            aria-pressed={days === o.days}
          >
            {o.label}
          </button>
        ))}
      </div>

      {state.loading && (
        <div className="bt-card bt-card--skeleton" aria-hidden>
          <div className="bt-skel" />
          <div className="bt-skel bt-skel--tall" />
        </div>
      )}

      {!state.loading && state.error && (
        <div className="bt-empty" role="alert">
          <h2>Backtest indisponible</h2>
          <p>Le calcul a échoué. Réessaie dans quelques minutes.</p>
        </div>
      )}

      {!state.loading && d && !hasDetail && (
        <div className="bt-empty">
          <h2>Collecte de données en cours</h2>
          <p>{d.message}</p>
          {d.sampleSize > 0 && d.minSample ? (
            <div className="bt-progress" aria-label={`${d.sampleSize} joueurs sur ${d.minSample} requis`}>
              <div className="bt-progress__bar" style={{ width: `${Math.min(100, (d.sampleSize / d.minSample) * 100)}%` }} />
            </div>
          ) : null}
        </div>
      )}

      {!state.loading && hasDetail && (
        <>
          {d.preview && (
            <div className="bt-preview" role="status">
              <strong>Aperçu admin — non publié.</strong> Échantillon de {d.sampleSize} joueurs
              ({d.minSample} requis, au moins 10 par groupe). Le public voit « collecte de données en cours ».
            </div>
          )}

          {d.sampleSize === 0 ? (
            <div className="bt-empty">
              <h2>Aucun joueur comparable</h2>
              <p>Pas encore de cartes suivies aux deux dates pour cette fenêtre.</p>
            </div>
          ) : (
            <>
              {d.summary && (
                <section className="bt-card bt-verdict">
                  <p className="bt-verdict__eyebrow">Verdict sur {HORIZON_OPTIONS.find((o) => o.days === d.horizonDays)?.label ?? `${d.horizonDays} jours`}</p>
                  <p className="bt-verdict__text">{d.summary}</p>
                </section>
              )}

              <section className="bt-tiers" aria-label="Performance par groupe de score">
                {d.tiers.map((t) => (
                  <div key={t.key} className={`bt-tier bt-tier--${t.key}`}>
                    <span className="bt-tier__label">{t.label}</span>
                    <span className="bt-tier__range">
                      {t.count > 0 ? `Score ${t.scoreMin.toFixed(1)} – ${t.scoreMax.toFixed(1)} · ${t.count} joueurs` : "—"}
                    </span>
                    <span
                      className={`bt-tier__value${t.medianChangePct > 0 ? " bt-row__delta--up" : t.medianChangePct < 0 ? " bt-row__delta--down" : ""}`}
                    >
                      {signedPct(t.medianChangePct)}
                    </span>
                    <span className="bt-tier__sub">
                      variation médiane · {t.pctUp ?? "—"} % en hausse
                    </span>
                  </div>
                ))}
              </section>

              <section className="bt-stats">
                <div className="bt-stat">
                  <span className="bt-stat__label">Échantillon</span>
                  <span className="bt-stat__value">{d.sampleSize}</span>
                  <span className="bt-stat__unit">joueurs comparés</span>
                </div>
                <div className="bt-stat">
                  <span className="bt-stat__label">Marché (médiane)</span>
                  <span className="bt-stat__value">{signedPct(d.marketMedianPct)}</span>
                  <span className="bt-stat__unit">tous joueurs confondus</span>
                </div>
                <div className="bt-stat">
                  <span className="bt-stat__label">Lien score ↔ prix</span>
                  <span className={`bt-stat__value ${spearmanLabel(d.spearman).className}`}>
                    {d.spearman != null ? d.spearman.toFixed(2) : "—"}
                  </span>
                  <span className="bt-stat__unit">{spearmanLabel(d.spearman).text} · corrélation de rang</span>
                </div>
              </section>

              <section className="bt-card">
                <h2 className="bt-card__title">Score vs performance de prix</h2>
                <p className="bt-card__sub">
                  Chaque point = un joueur. Axe horizontal : son score il y a{" "}
                  {HORIZON_OPTIONS.find((o) => o.days === d.horizonDays)?.label ?? `${d.horizonDays} jours`}.
                  Axe vertical : variation du prix de <em>ses mêmes cartes</em> depuis.
                </p>
                <ScatterPlot data={d.points} />
              </section>

              {d.topHigh?.length > 0 && (
                <section className="bt-card">
                  <h2 className="bt-card__title">Scores élevés — meilleures prédictions</h2>
                  <PredictionTable rows={d.topHigh} />
                </section>
              )}

              {d.worstHigh?.length > 0 && (
                <section className="bt-card">
                  <h2 className="bt-card__title">Scores élevés — pires ratés</h2>
                  <p className="bt-card__sub">Transparence : voici où le score s&apos;est trompé.</p>
                  <PredictionTable rows={d.worstHigh} />
                </section>
              )}
            </>
          )}

          <p className="bt-method">
            Méthode : chaque carte (même type, même gradation) est comparée à elle-même entre les deux
            dates — jamais une moyenne de cartes différentes. Prix = médiane des annonces eBay actives
            (prix demandés, pas encore les ventes conclues). Variation d&apos;un joueur = médiane de ses cartes.
          </p>
        </>
      )}
    </>
  );
}

function PredictionTable({ rows }) {
  return (
    <div className="bt-table">
      <div className="bt-table__head">
        <span>Joueur</span>
        <span>Score à T</span>
        <span>Cartes</span>
        <span>Variation</span>
      </div>
      {rows.map((r) => {
        const cls = r.priceChangePct > 0 ? "bt-row__delta--up" : r.priceChangePct < 0 ? "bt-row__delta--down" : "";
        return (
          <Link href={`/player/${r.playerId}`} key={r.playerId} className="bt-row">
            <span className="bt-row__name">{r.playerName}</span>
            <span className="bt-row__score">{r.scoreAtT.toFixed(1)}</span>
            <span className="bt-row__price">{r.cohorts}</span>
            <span className={`bt-row__delta ${cls}`}>{signedPct(r.priceChangePct)}</span>
          </Link>
        );
      })}
    </div>
  );
}
