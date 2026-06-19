"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import "./peer-comparison.css";

/**
 * Petite barre horizontale colorée selon le score.
 */
function ScoreBar({ score, maxScore = 10 }) {
  const pct = Math.max(0, Math.min(1, Number(score) / maxScore));
  const hue = Math.round(pct * 120); // 0=rouge, 60=jaune, 120=vert
  return (
    <div className="pc-bar">
      <div
        className="pc-bar__fill"
        style={{
          width: `${(pct * 100).toFixed(0)}%`,
          background: `hsl(${hue}, 65%, 50%)`,
        }}
      />
    </div>
  );
}

function PositionLabel(pos) {
  const p = String(pos ?? "").toUpperCase();
  if (p === "G") return "Gardiens";
  if (p === "D") return "Défenseurs";
  return "Attaquants";
}

/**
 * @param {{ playerId: string }} props
 */
export default function PeerComparison({ playerId }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: null });
    fetch(`/api/score/peers?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store" })
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
  }, [playerId]);

  if (state.loading) {
    return (
      <div className="pc-card pc-card--skeleton" aria-hidden>
        <div className="pc-skel-row" />
        <div className="pc-skel-row" />
        <div className="pc-skel-row" />
      </div>
    );
  }

  if (state.error || !state.data) return null;
  const { target, peers, percentile, poolSize, sleepers } = state.data;
  if (!Array.isArray(peers) || peers.length === 0) return null;

  const group = PositionLabel(target?.position);
  const isSleeperTarget = sleepers && sleepers.length > 0;
  const sleeperIds = new Set((sleepers ?? []).map((s) => s.playerId));

  return (
    <section className="pc-card">
      <header className="pc-header">
        <h2 className="pc-title">Comparaison vs pairs</h2>
        <div className="pc-sub">
          {group} de {target?.ageYears ?? "?"} ans ±2 ans
          {Number.isFinite(percentile) && (
            <> · Percentile <strong>{percentile}</strong>/100 · Pool de {poolSize}</>
          )}
        </div>
      </header>

      <ul className="pc-list">
        {/* Joueur cible en premier, distinctif */}
        <li className="pc-row pc-row--target">
          <div className="pc-row__name">
            <span className="pc-target-badge">Toi</span>
            <span className="pc-name-text">{target.playerName}</span>
            {target.team && <span className="pc-team">{target.team}</span>}
          </div>
          <div className="pc-row__bar">
            <ScoreBar score={target.score} />
          </div>
          <div className="pc-row__score">{Number(target.score).toFixed(1)}</div>
        </li>
        {peers.map((p) => {
          const isSleeper = sleeperIds.has(p.playerId);
          return (
            <li key={p.playerId} className={`pc-row${isSleeper ? " pc-row--sleeper" : ""}`}>
              <div className="pc-row__name">
                <Link className="pc-name-link" href={`/player/${p.playerId}`}>
                  {p.playerName}
                </Link>
                {p.team && <span className="pc-team">{p.team}</span>}
                {isSleeper && <span className="pc-sleeper-badge">Sous-évalué</span>}
              </div>
              <div className="pc-row__bar">
                <ScoreBar score={p.score} />
              </div>
              <div className="pc-row__score">{Number(p.score).toFixed(1)}</div>
            </li>
          );
        })}
      </ul>

      {isSleeperTarget && (
        <p className="pc-sleeper-note">
          Les joueurs marqués <strong>Sous-évalué</strong> ont un meilleur score
          mais un prix médian eBay inférieur — opportunités potentielles.
        </p>
      )}
    </section>
  );
}
