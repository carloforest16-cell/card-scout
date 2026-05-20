"use client";

import { useEffect, useState } from "react";

import { verdictTone } from "@/lib/verdictTone";

/**
 * @typedef {{ ok: boolean; score?: number; verdict?: string; reasoning?: string; factors?: Record<string, number>; verdictTone?: string; error?: string }} ScoreResponse
 */

/**
 * @param {{ playerId: string }} props
 */
export default function PlayerAiScoreClient({ playerId }) {
  const [res, setRes] = useState(
    /** @type {{ loading: boolean; data: ScoreResponse | null }} */ {
      loading: true,
      data: null,
    }
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: String(playerId) }),
        });
        const data = await r.json().catch(() => null);
        if (!cancelled) {
          setRes({
            loading: false,
            data: data && typeof data === "object" ? data : { ok: false },
          });
        }
      } catch {
        if (!cancelled) {
          setRes({
            loading: false,
            data: { ok: false, error: "Erreur réseau" },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (res.loading) {
    return (
      <section
        className="player__section player__section--score"
        aria-labelledby="player-score-heading"
      >
        <h2 id="player-score-heading" className="player__section-title">
          Card Scout Score
          <span className="player__section-badge">IA</span>
        </h2>
        <div className="player-score player-score--skeleton" aria-busy="true">
          <div className="player-skel-ai">
            <div className="player-skel-ai__bar" />
            <div className="player-skel-ai__bar" />
            <div className="player-skel-ai__bar" />
          </div>
          <div className="player-skel__line player-skel__line--score" />
          <div className="player-skel__line player-skel__line--wide" />
        </div>
      </section>
    );
  }

  const aiScore = res.data;
  const aiOk = Boolean(aiScore?.ok);
  const tone = aiOk
    ? aiScore.verdictTone ?? verdictTone(aiScore.verdict)
    : "unknown";

  return (
    <section
      className="player__section player__section--score"
      aria-labelledby="player-score-heading"
    >
      <h2 id="player-score-heading" className="player__section-title">
        Card Scout Score
        <span className="player__section-badge">IA</span>
      </h2>
      <div
        className={`player-score player-score--ai player-score--tone-${tone} ${
          aiOk ? "" : "player-score--unknown"
        }`}
        role="status"
      >
        {aiOk ? (
          <>
            <p className="player-score__value">
              <span className="player-score__number">{aiScore.score}</span>
              <span className="player-score__denom">/10</span>
            </p>
            <p
              className={`player-score__verdict player-score__verdict--${tone}`}
            >
              {aiScore.verdict}
            </p>
            <p className="player-score__reasoning">{aiScore.reasoning}</p>
            <div className="player-score__factors" aria-label="Sous-scores">
              {[
                ["performance", "Performance", aiScore.factors?.performance],
                ["trajectory", "Trajectoire", aiScore.factors?.trajectory],
                ["marketValue", "Valeur marché", aiScore.factors?.marketValue],
                ["age", "Âge", aiScore.factors?.age],
              ].map(([key, label, val]) => {
                const n = typeof val === "number" ? val : 0;
                const pct = Math.min(100, Math.max(0, n * 10));
                return (
                  <div key={key} className="player-score__factor">
                    <div className="player-score__factor-head">
                      <span className="player-score__factor-label">{label}</span>
                      <span className="player-score__factor-num">
                        {n.toFixed(1)}
                      </span>
                    </div>
                    <div className="player-score__factor-track">
                      <div
                        className="player-score__factor-fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="player-score__value">
              <span className="player-score__number player-score__number--na">
                —
              </span>
              <span className="player-score__denom">/10</span>
            </p>
            <p className="player-score__summary player-score__summary--error">
              Score IA indisponible pour le moment.
              {aiScore?.error ? (
                <>
                  {" "}
                  <span className="player-score__err-detail">
                    ({aiScore.error})
                  </span>
                </>
              ) : null}
            </p>
            <p className="player-score__hint">
              Ajoute{" "}
              <code className="player__ebay-code">ANTHROPIC_API_KEY</code> dans{" "}
              <code className="player__ebay-code">.env.local</code> pour activer
              Claude.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
