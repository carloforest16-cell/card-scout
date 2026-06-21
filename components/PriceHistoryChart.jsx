"use client";

import { useEffect, useState } from "react";

/**
 * Mini-chart SVG montrant l'évolution des prix sur N mois.
 * Fetch côté client depuis /api/price-history.
 */
export default function PriceHistoryChart({ playerName, cardType, months = 12 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerName) return;
    setLoading(true);
    const params = new URLSearchParams({ player: playerName });
    if (cardType) params.set("cardType", cardType);
    if (months !== 12) params.set("months", String(months));

    fetch(`/api/price-history?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [playerName, cardType, months]);

  if (loading) {
    return (
      <div className="ph-chart ph-chart--loading">
        <div className="ph-chart__skel" />
      </div>
    );
  }

  if (!data || !data.history || data.history.length < 2) {
    return (
      <div className="ph-chart ph-chart--empty">
        <p className="ph-chart__empty-text">
          Cette fonctionnalité arrive bientôt.
          <br />
          <span className="ph-chart__empty-sub">L&apos;historique de prix sera disponible prochainement.</span>
        </p>
      </div>
    );
  }

  const points = data.history;
  const prices = points.map((p) => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const W = 320;
  const H = 100;
  const PAD_X = 4;
  const PAD_Y = 8;
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_Y * 2;

  const pts = points.map((p, i) => ({
    x: PAD_X + (i / (points.length - 1)) * chartW,
    y: PAD_Y + chartH - ((p.price - minP) / range) * chartH,
  }));

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H} L ${pts[0].x.toFixed(1)} ${H} Z`;

  const trendColor =
    data.direction === "up" ? "var(--profit, #22c55e)" :
    data.direction === "down" ? "var(--loss, #ef4444)" :
    "var(--ice, #00d4ff)";

  return (
    <div className="ph-chart">
      <div className="ph-chart__header">
        <span className="ph-chart__title">
          {cardType || "Toutes cartes"} — {months} mois
        </span>
        {data.trendPct != null && (
          <span className="ph-chart__trend" style={{ color: trendColor }}>
            {data.trendPct > 0 ? "+" : ""}{data.trendPct}%
          </span>
        )}
      </div>
      <svg
        className="ph-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-label={`Évolution des prix : ${data.trendPct != null ? `${data.trendPct > 0 ? "+" : ""}${data.trendPct}%` : "stable"}`}
        role="img"
      >
        <defs>
          <linearGradient id="ph-area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ph-area-grad)" />
        <path d={line} fill="none" stroke={trendColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3" fill={trendColor} />
      </svg>
      <div className="ph-chart__footer">
        <span className="ph-chart__label">{points[0].date}</span>
        <span className="ph-chart__label">{points[points.length - 1].date}</span>
      </div>
      <p className="ph-chart__source">Basé sur annonces actives · {data.dataPoints} snapshots</p>
    </div>
  );
}
