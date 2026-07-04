"use client";

import "./score-delta.css";

/**
 * Delta de Card Metrics Score (7j), pour toute page qui affiche un score
 * joueur — alimenté par `getScoreDeltas()` (lib/playerScores.js). Tâche 3.3
 * du plan : mêmes tons/pattern que `.dash-watch__delta` (dashboard), extrait
 * en composant partagé pour /opportunites, /pulse, etc.
 *
 * @param {{ delta?: number | null; direction?: "up" | "down" | "flat" | null; hasHistory?: boolean; className?: string }} props
 */
export default function ScoreDelta({ delta = null, direction = null, hasHistory = false, className = "" }) {
  if (!hasHistory) {
    return <span className={`score-delta score-delta--flat ${className}`}>Nouveau</span>;
  }

  const dir = direction === "up" ? "up" : direction === "down" ? "down" : "flat";
  const abs = delta == null ? null : Math.abs(delta).toFixed(1);

  return (
    <span className={`score-delta score-delta--${dir} ${className}`}>
      {dir === "up" && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 17l10-10M9 7h8v8" />
        </svg>
      )}
      {dir === "down" && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 7l10 10M9 17h8V9" />
        </svg>
      )}
      {dir === "flat" || abs == null ? "±0" : `${dir === "up" ? "+" : "−"}${abs}`}
      <span className="score-delta__suffix"> · 7j</span>
    </span>
  );
}
