"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Zap,
  TrendingUp,
  Gauge,
  Clock,
  DollarSign,
  RefreshCw,
  Rocket,
  Flame,
  Target,
  Shield,
  Trophy,
  Sparkles,
  Megaphone,
  LayoutList,
  Orbit,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import FollowButton from "@/app/components/FollowButton";
import AlertButton from "@/app/components/AlertButton";
import FastAddVaultModal from "@/app/components/FastAddVaultModal";

// ── Shared data ──────────────────────────────────────────────────────────────

const FACTORS = [
  { key: "performance",       label: "Performance",  weight: 0.14, Icon: Zap },
  { key: "momentum",          label: "Momentum",     weight: 0.10, Icon: TrendingUp },
  { key: "momentumDetailed",  label: "Accélération", weight: 0.08, Icon: Gauge },
  { key: "age",               label: "Âge",          weight: 0.10, Icon: Clock },
  { key: "marketValue",       label: "Marché",       weight: 0.10, Icon: DollarSign },
  { key: "liquidity",         label: "Liquidité",    weight: 0.04, Icon: RefreshCw },
  { key: "upside",            label: "Upside",       weight: 0.14, Icon: Rocket },
  { key: "hype",              label: "Hype",         weight: 0.14, Icon: Flame },
  { key: "marketDiscrepancy", label: "Discrépance",  weight: 0.05, Icon: Target },
  { key: "risk",              label: "Risque",       weight: 0.05, Icon: Shield },
  { key: "teamContext",       label: "Équipe",       weight: 0,    Icon: Trophy },
  { key: "catalysts",         label: "Catalyseurs",  weight: 0.06, Icon: Sparkles },
  { key: "socialAttention",   label: "Buzz",         weight: 0,    Icon: Megaphone },
];

function scoreColor(score) {
  const t = Math.min(10, Math.max(0, Number(score) || 0)) / 10;
  return `hsl(${Math.round(t * 120)}, 72%, 50%)`;
}

function factorDescription(key, score) {
  const s = Number(score) || 0;
  switch (key) {
    case "performance":
      return s >= 8 ? "Production élite NHL" : s >= 6 ? "Au-dessus de la moyenne" : "Production limitée";
    case "momentum":
      return s >= 8 ? "Progression explosive" : s >= 6 ? "Trajectoire stable" : "Régression observée";
    case "momentumDetailed":
      return s >= 9 ? "Accélération forte" : s >= 7 ? "Hot streak" : s >= 4 ? "Cadence stable" : s >= 2 ? "Refroidissement" : "Chute libre";
    case "age":
      return s >= 9 ? "5-10 ans devant lui" : s >= 7 ? "Dans sa prime" : "Fenêtre limitée";
    case "marketValue":
      return s >= 8 ? "Cartes undervalued" : s >= 6 ? "Prix raisonnable" : "Marché saturé";
    case "liquidity":
      return s >= 8 ? "Fort volume eBay" : s >= 5 ? "Marché actif" : "Peu de transactions";
    case "upside":
      return s >= 8 ? "Début de carrière" : s >= 5 ? "Profil établi" : "Carrière avancée";
    case "hype":
      return s >= 8 ? "Marché canadien + rookie" : s >= 5 ? "Visibilité modérée" : "Peu de hype";
    case "marketDiscrepancy":
      return s >= 8 ? "Signal d'achat" : s >= 5 ? "Marché aligné" : s >= 3 ? "Surveiller" : "Signal de vente";
    case "risk":
      return s >= 8 ? "Carte safe" : s >= 5 ? "Risque modéré" : s >= 3 ? "Risque élevé" : "Très spéculatif";
    case "teamContext":
      return s >= 8 ? "Équipe en feu" : s >= 6 ? "En spot playoff" : s >= 4 ? "Équipe bulle" : "Bas du classement";
    case "catalysts":
      return s >= 8 ? "Plusieurs convergent" : s >= 6 ? "Événement à venir" : s >= 5 ? "Rien d'imminent" : "Calme plat";
    case "socialAttention":
      return s >= 8 ? "Viral sur Reddit" : s >= 6 ? "Bonne visibilité" : s >= 5 ? "Discussions modérées" : "Peu de mentions";
    default:
      return "";
  }
}

function resolveFactorItems(factors) {
  return FACTORS.map((def) => {
    const raw = factors?.[def.key];
    let score = 0;
    if (raw != null && typeof raw === "object" && raw.score != null) score = Number(raw.score);
    else if (typeof raw === "number") score = raw;
    if (!Number.isFinite(score)) score = 0;
    const rounded = Math.round(Math.min(10, Math.max(0, score)) * 10) / 10;
    return { ...def, score: rounded, description: factorDescription(def.key, rounded) };
  });
}

function verdictTone(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "buy";
  if (v.includes("éviter") || v.includes("eviter") || v.includes("passer")) return "avoid";
  return "watch";
}

// ── View Toggle (DiscoverButton-style pill) ────────────────────────────────────

const VIEWS = [
  { id: "orbital", label: "Orbital",  Icon: Orbit },
  { id: "detail",  label: "Détaillé", Icon: LayoutList },
];

function ViewToggle({ activeView, onChange }) {
  return (
    <div className="sp-view-toggle" role="tablist" aria-label="Affichage du score">
      {VIEWS.map((view) => {
        const active = activeView === view.id;
        return (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`sp-view-toggle__btn${active ? " sp-view-toggle__btn--active" : ""}`}
            onClick={() => onChange(view.id)}
          >
            <view.Icon size={13} className="sp-view-toggle__icon" />
            <span className="sp-view-toggle__label">{view.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Inline Orbital Timeline ────────────────────────────────────────────────────

function OrbitalTimeline({ factorItems, score, verdict }) {
  const [expandedId, setExpandedId] = useState(null);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const containerRef = useRef(null);
  const orbitRef = useRef(null);

  const formattedScore =
    score != null && Number.isFinite(Number(score)) ? Number(score).toFixed(1) : "—";

  useEffect(() => {
    let timer;
    if (autoRotate) {
      timer = setInterval(() => setRotationAngle((prev) => (prev + 0.3) % 360), 50);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [autoRotate]);

  const handleBackgroundClick = (e) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandedId(null);
      setAutoRotate(true);
    }
  };

  const toggleNode = (key) => {
    if (expandedId === key) {
      setExpandedId(null);
      setAutoRotate(true);
    } else {
      setExpandedId(key);
      setAutoRotate(false);
      const idx = factorItems.findIndex((f) => f.key === key);
      setRotationAngle(270 - (idx / factorItems.length) * 360);
    }
  };

  const getNodePosition = (index, total) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const stageW = containerRef.current?.offsetWidth ?? 420;
    const radius = Math.min(178, stageW * 0.42);
    const radian = (angle * Math.PI) / 180;
    return {
      x: radius * Math.cos(radian),
      y: radius * Math.sin(radian),
      zIndex: Math.round(100 + 50 * Math.cos(radian)),
      opacity: Math.max(0.4, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2)),
    };
  };

  return (
    <div className="sb-orbital sp-orbital--inline" ref={containerRef} onClick={handleBackgroundClick}>
      {verdict && <div className="sb-orbital__verdict" style={{ marginBottom: "0.5rem" }}>{verdict}</div>}
      <div className="sb-orbital__stage sp-orbital__stage--sm" ref={orbitRef}>
        {/* Core */}
        <div className="sb-orbital__core">
          <div className="sb-orbital__core-ring sb-orbital__core-ring--1" />
          <div className="sb-orbital__core-ring sb-orbital__core-ring--2" />
          <div className="sb-orbital__core-inner">
            <span className="sb-orbital__core-score">{formattedScore}</span>
          </div>
        </div>

        <div className="sb-orbital__ring sp-orbital__ring--sm" />

        {factorItems.map((item, index) => {
          const pos = getNodePosition(index, factorItems.length);
          const isExpanded = expandedId === item.key;
          const Icon = item.Icon;

          return (
            <div
              key={item.key}
              className="sb-orbital__node"
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                zIndex: isExpanded ? 200 : pos.zIndex,
                opacity: isExpanded ? 1 : pos.opacity,
              }}
              onClick={(e) => { e.stopPropagation(); toggleNode(item.key); }}
            >
              <div
                className="sb-orbital__node-glow"
                style={{
                  width: `${item.score * 4 + 30}px`,
                  height: `${item.score * 4 + 30}px`,
                  background: `radial-gradient(circle, ${scoreColor(item.score)}30 0%, transparent 70%)`,
                }}
              />
              <div
                className={`sb-orbital__node-circle${isExpanded ? " sb-orbital__node-circle--active" : ""}`}
                style={{
                  width: `${26 + item.score * 1.8}px`,
                  height: `${26 + item.score * 1.8}px`,
                  borderColor: scoreColor(item.score),
                  background: isExpanded ? scoreColor(item.score) : `${scoreColor(item.score)}18`,
                  boxShadow: `0 0 ${item.score * 1.5}px ${scoreColor(item.score)}44`,
                }}
              >
                <Icon size={isExpanded ? 14 : Math.max(11, 9 + item.score * 0.5)} />
              </div>

              <div className={`sb-orbital__node-label${isExpanded ? " sb-orbital__node-label--active" : ""}`}>
                <span>{item.label}</span>
                <span className="sb-orbital__node-score" style={{ color: scoreColor(item.score) }}>
                  {item.score.toFixed(1)}
                </span>
              </div>

              {isExpanded && (
                <Card className="sb-orbital__card">
                  <div className="sb-orbital__card-stem" />
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center justify-between">
                      <span
                        className="sb-orbital__card-badge"
                        style={{
                          color: scoreColor(item.score),
                          borderColor: `${scoreColor(item.score)}44`,
                          background: `${scoreColor(item.score)}11`,
                        }}
                      >
                        {item.score.toFixed(1)}/10
                      </span>
                      <span className="text-xs font-mono text-white/50">
                        {Math.round(item.weight * 100)}%
                      </span>
                    </div>
                    <CardTitle className="text-sm mt-1.5 text-white">{item.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0 text-xs text-white/80">
                    <p>{item.description}</p>
                    <div className="mt-3 pt-2 border-t border-white/10">
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="flex items-center gap-1 text-white/60">
                          <Zap size={10} /> Score
                        </span>
                        <span className="font-mono" style={{ color: scoreColor(item.score) }}>
                          {item.score.toFixed(1)}
                        </span>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(item.score / 10) * 100}%`,
                            background: `linear-gradient(90deg, ${scoreColor(item.score)}88, ${scoreColor(item.score)})`,
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

// ── Detail (linear) view ───────────────────────────────────────────────────────

function DetailView({ factorItems, score, verdict, tone, reasoning }) {
  const formattedScore =
    score != null && Number.isFinite(Number(score)) ? Number(score).toFixed(1) : "—";

  return (
    <div className="sp-score-panel sp-panel-fade">
      <div className="sp-score-panel__header">
        <div className="sp-score-panel__big">
          <span className="sp-score-panel__number">{formattedScore}</span>
          <span className="sp-score-panel__denom">/10</span>
        </div>
        <div className="sp-score-panel__label-group">
          <span className="sp-score-panel__label">CARD SCOUT SCORE</span>
          {verdict && (
            <span className={`sp-score-panel__verdict sp-score-panel__verdict--${tone}`}>
              <span className="sp-score-panel__verdict-dot" />
              {verdict}
            </span>
          )}
        </div>
      </div>

      <div className="sp-factors">
        {factorItems.map((factor) => {
          const pct = Math.min(100, Math.max(0, (factor.score / 10) * 100));
          const color = scoreColor(factor.score);
          const Icon = factor.Icon;
          return (
            <div key={factor.key} className="sp-factor">
              <div className="sp-factor__head">
                <div className="sp-factor__info">
                  <Icon size={14} style={{ color }} />
                  <span className="sp-factor__label">{factor.label}</span>
                </div>
                <span className="sp-factor__value" style={{ color }}>{factor.score.toFixed(1)}</span>
              </div>
              <div className="sp-factor__track">
                <div className="sp-factor__bar" style={{ width: `${pct}%`, background: color }} />
              </div>
              <p className="sp-factor__desc">{factor.description}</p>
            </div>
          );
        })}
      </div>

      {reasoning && (
        <div className="sp-reasoning sp-reasoning--inpanel">
          <p className="sp-reasoning__label">ANALYSE IA</p>
          <p className="sp-reasoning__text">{reasoning}</p>
        </div>
      )}
    </div>
  );
}

// ── Player Visual ─────────────────────────────────────────────────────────────

function PlayerVisual({ headshotUrl, fullName, team, teamLogoUrl }) {
  return (
    <div className="sp-visual">
      <div className="sp-visual__ring sp-visual__ring--outer" />
      <div className="sp-visual__glow" />
      <div className="sp-visual__frame">
        <div className="sp-visual__float">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={headshotUrl}
            alt={`Portrait ${fullName}`}
            className="sp-visual__img"
            width={420}
            height={420}
            fetchPriority="high"
            draggable={false}
          />
        </div>
      </div>
      <div className="sp-visual__status">
        <div className="sp-visual__status-inner">
          {teamLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="sp-visual__team-logo" src={teamLogoUrl} alt="" width={18} height={18} />
          ) : (
            <span className="sp-visual__status-dot" />
          )}
          <span>{team}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SpatialPlayerShowcase({
  playerId,
  fullName,
  team,
  position,
  sweater,
  headshotUrl,
  teamLogoUrl,
}) {
  const [score, setScore]       = useState(null);
  const [verdict, setVerdict]   = useState(null);
  const [factors, setFactors]   = useState(null);
  const [reasoning, setReasoning] = useState(null);
  const [scoreState, setScoreState] = useState("loading");
  const [activeView, setActiveView] = useState("orbital");
  const [showVaultModal, setShowVaultModal] = useState(false);

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
        if (cancelled) return;
        if (data?.ok && data.score != null) {
          setScore(Number(data.score));
          setVerdict(data.verdict ?? null);
          setFactors(data.factors ?? null);
          setReasoning(data.reasoning ?? null);
          setScoreState("ready");
        } else {
          setScoreState("error");
        }
      } catch {
        if (!cancelled) setScoreState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  const factorItems = useMemo(() => resolveFactorItems(factors), [factors]);
  const tone = verdict ? verdictTone(verdict) : "watch";

  return (
    <header className="sp-showcase">
      <div className="sp-bg">
        <div className="sp-bg__layer sp-bg__layer--ice" />
        <div className="sp-bg__layer sp-bg__layer--gold" />
      </div>

      <div className="sp-showcase__inner">
        <PlayerVisual
          headshotUrl={headshotUrl}
          fullName={fullName}
          team={team}
          teamLogoUrl={teamLogoUrl}
        />

        <div className="sp-showcase__content">
          <div className="sp-details">
            <p className="sp-details__eyebrow">PROFIL JOUEUR</p>
            <h1 className="sp-details__name">{fullName}</h1>
            <div className="sp-details__actions">
              <FollowButton
                playerId={playerId}
                playerName={fullName}
                playerTeam={team}
                playerPosition={position}
                headshotUrl={headshotUrl}
              />
              <AlertButton playerId={playerId} playerName={fullName} />
              <button
                type="button"
                className="vault-add-btn"
                onClick={() => setShowVaultModal(true)}
                aria-label="Ajouter au vault"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                  <line x1="12" y1="12" x2="12" y2="16"/>
                  <line x1="10" y1="14" x2="14" y2="14"/>
                </svg>
                <span>Vault</span>
              </button>
            </div>
            {showVaultModal && (
              <FastAddVaultModal
                player={{ id: String(playerId), name: fullName, team, headshotUrl }}
                onClose={() => setShowVaultModal(false)}
              />
            )}
            <p className="sp-details__meta">
              {team}
              <span className="sp-details__sep" aria-hidden>/</span>
              {position}
              <span className="sp-details__sep" aria-hidden>/</span>
              {sweater}
            </p>

            {scoreState === "ready" ? (
              <>
                <ViewToggle activeView={activeView} onChange={setActiveView} />
                {activeView === "orbital" ? (
                  <div className="sp-panel-fade" key="orbital">
                    <OrbitalTimeline factorItems={factorItems} score={score} verdict={verdict} />
                    {reasoning && (
                      <div className="sp-reasoning">
                        <p className="sp-reasoning__label">ANALYSE IA</p>
                        <p className="sp-reasoning__text">{reasoning}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <DetailView
                    key="detail"
                    factorItems={factorItems}
                    score={score}
                    verdict={verdict}
                    tone={tone}
                    reasoning={reasoning}
                  />
                )}
              </>
            ) : scoreState === "loading" ? (
              <div className="sp-score-panel sp-score-panel--loading" aria-busy="true">
                <span className="cn-mono sp-score-panel__loading-text">CALCUL DU SCORE…</span>
              </div>
            ) : (
              <div className="sp-score-panel sp-score-panel--error">
                <span className="cn-mono sp-score-panel__loading-text">SCORE INDISPONIBLE</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
