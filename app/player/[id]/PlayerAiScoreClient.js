"use client";

import { useEffect, useMemo, useState } from "react";

import { verdictTone } from "@/lib/verdictTone";

const REASONING_PREVIEW_LEN = 120;

const FACTORS = [
  { key: "performance", label: "Performance", emoji: "⚡" },
  { key: "momentum", label: "Momentum", emoji: "📈" },
  { key: "momentumDetailed", label: "Accélération", emoji: "🏎️" },
  { key: "age", label: "Âge", emoji: "🎂" },
  { key: "marketValue", label: "Marché", emoji: "💰" },
  { key: "liquidity", label: "Liquidité", emoji: "🔄" },
  { key: "upside", label: "Upside", emoji: "🚀" },
  { key: "hype", label: "Hype", emoji: "🔥" },
  { key: "marketDiscrepancy", label: "Discrépance", emoji: "🎯" },
  { key: "risk", label: "Risque", emoji: "🛡️" },
  { key: "teamContext", label: "Équipe", emoji: "🏒" },
];

/**
 * @typedef {{ ok: boolean; score?: number; verdict?: string; reasoning?: string; factors?: Record<string, number | { score?: number }>; verdictTone?: string; error?: string }} ScoreResponse
 */

function formatScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return (Math.round(x * 10) / 10).toFixed(1);
}

/**
 * @param {string} key
 * @param {number} score
 */
function generateFactorDescription(key, score) {
  const s = Number(score) || 0;
  switch (key) {
    case "performance":
      if (s >= 8) return "Production élite NHL";
      if (s >= 5) return "Au-dessus de la moyenne";
      return "Production limitée";
    case "momentum":
      if (s >= 8) return "Progression explosive";
      if (s >= 5) return "Trajectoire stable";
      return "Régression observée";
    case "momentumDetailed":
      if (s >= 9) return "Accélération forte";
      if (s >= 7) return "Hot streak";
      if (s >= 4) return "Cadence stable";
      if (s >= 2) return "Refroidissement";
      return "Chute libre";
    case "marketDiscrepancy":
      if (s >= 8) return "Signal d'achat";
      if (s >= 5) return "Marché aligné";
      if (s >= 3) return "Surveiller";
      return "Signal de vente";
    case "risk":
      if (s >= 8) return "Carte safe";
      if (s >= 5) return "Risque modéré";
      if (s >= 3) return "Risque élevé";
      return "Très spéculatif";
    case "teamContext":
      if (s >= 8) return "Équipe en feu";
      if (s >= 6) return "En spot playoff";
      if (s >= 4) return "Équipe bulle";
      return "Bas du classement";
    case "age":
      if (s >= 9) return "5-10 ans devant lui";
      if (s >= 7) return "Dans sa prime";
      return "Fenêtre limitée";
    case "marketValue":
      if (s >= 8) return "Cartes undervalued";
      if (s >= 5) return "Prix raisonnable";
      return "Marché saturé";
    case "liquidity":
      if (s >= 8) return "Fort volume eBay";
      if (s >= 5) return "Marché actif";
      return "Peu de transactions";
    case "upside":
      if (s >= 8) return "Début de carrière";
      if (s >= 5) return "Profil établi";
      return "Carrière avancée";
    case "hype":
      if (s >= 8) return "Marché canadien + rookie";
      if (s >= 5) return "Visibilité modérée";
      return "Peu de hype";
    default:
      return "";
  }
}

/**
 * @param {Record<string, number | { score?: number }> | undefined} factors
 */
function resolveFactorItems(factors) {
  return FACTORS.map((def) => {
    const raw = factors?.[def.key];
    let score = 0;
    if (raw != null && typeof raw === "object" && raw.score != null) {
      score = Number(raw.score);
    } else if (typeof raw === "number") {
      score = raw;
    }
    if (!Number.isFinite(score)) score = 0;
    const rounded = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;
    return {
      ...def,
      score: rounded,
      description: generateFactorDescription(def.key, rounded),
    };
  });
}

/**
 * @param {number} score
 */
function scoreBarColor(score) {
  const t = Math.min(10, Math.max(0, Number(score) || 0)) / 10;
  return `hsl(${Math.round(t * 120)}, 72%, 50%)`;
}

/**
 * @param {object} props
 * @param {Array<{ key: string; label: string; score: number }>} props.items
 */
function FactorRadarChart({ items }) {
  const size = 250;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 88;
  const count = items.length || 7;
  const gridLevels = [2, 4, 6, 8, 10];

  function pointAt(i, score) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const r = (score / 10) * maxR;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function axisAt(i, dist = maxR + 20) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
  }

  const dataPoints = items.map((item, i) => pointAt(i, item.score));
  const polygon = dataPoints.map(([x, y]) => `${x},${y}`).join(" ");

  return (
    <div className="player-score__radar-wrap">
      <svg
        className="player-score__radar"
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label="Graphique radar des 7 facteurs Card Scout"
      >
        {gridLevels.map((level) => {
          const pts = items
            .map((_, i) => {
              const [x, y] = pointAt(i, level);
              return `${x},${y}`;
            })
            .join(" ");
          return (
            <polygon
              key={`grid-${level}`}
              points={pts}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
            />
          );
        })}
        {items.map((_, i) => {
          const [x, y] = pointAt(i, 10);
          return (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
            />
          );
        })}
        <polygon
          points={polygon}
          fill="rgba(255, 23, 68, 0.22)"
          stroke="rgba(255, 23, 68, 0.85)"
          strokeWidth="2"
        />
        {dataPoints.map(([x, y], i) => (
          <circle key={`dot-${i}`} cx={x} cy={y} r="3.5" fill="#fff" />
        ))}
        {items.map((item, i) => {
          const [lx, ly] = axisAt(i);
          return (
            <text
              key={`lbl-${item.key}`}
              x={lx}
              y={ly}
              fill="#fff"
              fontSize="10"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {item.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.emoji
 * @param {string} props.label
 * @param {number} props.score
 * @param {string} props.description
 */
function FactorPill({ emoji, label, score, description }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color = scoreBarColor(score);

  return (
    <div className="player-score__pill">
      <div className="player-score__pill-head">
        <span className="player-score__pill-emoji" aria-hidden>
          {emoji}
        </span>
        <span className="player-score__pill-label">{label}</span>
        <span className="player-score__pill-score">{formatScore(score)}/10</span>
      </div>
      <div className="player-score__pill-track">
        <div
          className="player-score__pill-bar"
          style={{
            width: mounted ? `${pct}%` : "0%",
            background: color,
            transition: "width 0.6s ease",
          }}
        />
      </div>
      {description ? (
        <p className="player-score__pill-desc">{description}</p>
      ) : null}
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.reasoning
 * @param {boolean} props.showFull
 * @param {() => void} props.onToggle
 */
function ReasoningText({ reasoning, showFull, onToggle }) {
  const text = String(reasoning).trim();
  const isLong = text.length > REASONING_PREVIEW_LEN;
  const preview = isLong
    ? `${text.slice(0, REASONING_PREVIEW_LEN)}...`
    : text;
  const display = showFull || !isLong ? text : preview;

  return (
    <p className="player-score__reasoning-brief">
      {display}
      {isLong ? (
        <>
          {" "}
          <button
            type="button"
            className="player-score__reasoning-toggle"
            onClick={onToggle}
            aria-expanded={showFull}
          >
            {showFull ? "Voir moins" : "Voir plus"}
          </button>
        </>
      ) : null}
    </p>
  );
}

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
  const [showFullReasoning, setShowFullReasoning] = useState(false);

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

  const factorItems = useMemo(
    () => resolveFactorItems(res.data?.factors),
    [res.data?.factors]
  );

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
          <div className="player-skel__line player-skel__line--score" />
          <div className="player-skel__line player-skel__line--wide" />
          <div className="player-score__radar-wrap player-score__radar-wrap--skeleton" />
          <div className="player-score__factor-pills">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={`sk-${i}`} className="player-score__pill-skeleton" />
            ))}
          </div>
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

            <FactorRadarChart items={factorItems} />

            <div
              className="player-score__factor-pills"
              aria-label="Sous-scores par facteur"
            >
              {factorItems.map((item) => (
                <FactorPill
                  key={item.key}
                  emoji={item.emoji}
                  label={item.label}
                  score={item.score}
                  description={item.description}
                />
              ))}
            </div>

            {aiScore.reasoning ? (
              <ReasoningText
                reasoning={aiScore.reasoning}
                showFull={showFullReasoning}
                onToggle={() => setShowFullReasoning((v) => !v)}
              />
            ) : null}
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
              <code className="player__ebay-code">CS_CLAUDE_KEY</code> dans{" "}
              <code className="player__ebay-code">.env.local</code> pour activer
              Claude.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
