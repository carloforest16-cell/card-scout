"use client";

import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SCORE_WEIGHTS_BY_KEY } from "@/lib/cardScoutScoreMath";

// Poids (weight) tirés de SCORE_WEIGHTS_BY_KEY (source unique, lib/cardScoutScoreMath.js
// — tâche 3.1 du plan). Ce fichier avait dérivé (hype 14% au lieu de 7%, Équipe
// et Buzz à 0% au lieu de 4%/3% — jamais mis à jour depuis l'activation de ces
// deux facteurs). Ne garde localement que label + icône, spécifiques à cette UI.
const FACTORS = [
  { key: "performance", label: "Performance", Icon: Zap },
  { key: "momentum", label: "Momentum", Icon: TrendingUp },
  { key: "momentumDetailed", label: "Accélération", Icon: Gauge },
  { key: "age", label: "Âge", Icon: Clock },
  { key: "marketValue", label: "Marché", Icon: DollarSign },
  { key: "liquidity", label: "Liquidité", Icon: RefreshCw },
  { key: "upside", label: "Upside", Icon: Rocket },
  { key: "hype", label: "Hype", Icon: Flame },
  { key: "marketDiscrepancy", label: "Discrépance", Icon: Target },
  { key: "risk", label: "Risque", Icon: Shield },
  { key: "teamContext", label: "Équipe", Icon: Trophy },
  { key: "catalysts", label: "Catalyseurs", Icon: Sparkles },
  { key: "socialAttention", label: "Buzz", Icon: Megaphone },
].map((f) => ({ ...f, weight: SCORE_WEIGHTS_BY_KEY[f.key] }));

function factorDescription(key, score) {
  const s = Number(score) || 0;
  switch (key) {
    case "performance":
      if (s >= 8) return "Production élite, au-dessus de la moyenne NHL";
      if (s >= 6) return "Solide, légèrement au-dessus de la moyenne";
      return "Production en-dessous de la moyenne NHL";
    case "momentum":
      if (s >= 8) return "Progression explosive cette saison";
      if (s >= 6) return "Trajectoire stable et constante";
      return "Légère régression observée";
    case "momentumDetailed":
      if (s >= 9) return "Accélération forte sur les fenêtres 5/10/15 matchs";
      if (s >= 7) return "Hot streak récent au-dessus de sa moyenne saison";
      if (s >= 4) return "Cadence stable, dans sa moyenne saison";
      if (s >= 2) return "Refroidissement par rapport à la saison";
      return "Chute libre sur les derniers matchs";
    case "marketDiscrepancy":
      if (s >= 8) return "Score interne grimpe mais prix eBay encore au plancher";
      if (s >= 5) return "Score et prix du marché alignés";
      if (s >= 3) return "Score en déclin, surveiller le marché";
      return "Score chute alors que le prix reste élevé — signal de vente";
    case "risk":
      if (s >= 8) return "Profil safe — âge optimal, durable, stade carrière stable";
      if (s >= 5) return "Risque modéré — quelques facteurs d'incertitude";
      if (s >= 3) return "Risque élevé — fin de courbe ou blessures";
      return "Très spéculatif — combinaison de facteurs négatifs";
    case "teamContext":
      if (s >= 8) return "Équipe en haut du classement, projecteurs médiatiques";
      if (s >= 6) return "En spot playoff, visibilité solide";
      if (s >= 4) return "Équipe bulle ou rebuild en cours";
      return "Bas du classement, peu de visibilité";
    case "catalysts":
      if (s >= 8) return "Plusieurs catalyseurs convergent (match national, milestone, playoffs)";
      if (s >= 6) return "Au moins un événement upcoming significatif";
      if (s >= 5) return "Rien d'imminent à signaler";
      return "Période calme côté événements";
    case "socialAttention":
      if (s >= 8) return "Recherches Wikipedia en flèche — forte demande spéculative";
      if (s >= 6) return "Bonne visibilité auprès du public";
      if (s >= 5) return "Intérêt modéré dans les recherches";
      return "Peu d'attention publique détectée";
    case "age":
      if (s >= 9) return "Pleine courbe de progression, 5-10 ans devant lui";
      if (s >= 7) return "Dans sa prime offensive";
      return "Fenêtre d'appréciation limitée";
    case "marketValue":
      if (s >= 8) return "Cartes undervalued vs sa valeur réelle";
      if (s >= 6) return "Prix de marché raisonnable";
      return "Marché potentiellement saturé";
    case "liquidity":
      if (s >= 8) return "Fort volume, facile à revendre";
      if (s >= 5) return "Marché actif et liquide";
      return "Peu de transactions récentes";
    case "upside":
      if (s >= 8) return "Début de carrière, plafond inconnu";
      if (s >= 5) return "Profil établi, progression stable";
      return "Carrière avancée, upside limité";
    case "hype":
      if (s >= 8) return "Marché canadien + bonus rookie";
      if (s >= 5) return "Visibilité modérée";
      return "Peu de facteurs hype détectés";
    default:
      return "";
  }
}

function scoreColor(score) {
  const t = Math.min(10, Math.max(0, Number(score) || 0)) / 10;
  return `hsl(${Math.round(t * 120)}, 72%, 50%)`;
}

function scoreTier(score) {
  if (score >= 7) return "high";
  if (score >= 5) return "mid";
  return "low";
}

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
      description: factorDescription(def.key, rounded),
      tier: scoreTier(rounded),
    };
  });
}

function OrbitalTimeline({ factorItems, score, verdict }) {
  const [expandedId, setExpandedId] = useState(null);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const containerRef = useRef(null);
  const orbitRef = useRef(null);

  const formattedScore =
    score != null && Number.isFinite(Number(score))
      ? Number(score).toFixed(1)
      : "—";

  useEffect(() => {
    let timer;
    if (autoRotate) {
      timer = setInterval(() => {
        setRotationAngle((prev) => (prev + 0.3) % 360);
      }, 50);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
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
      const targetAngle = (idx / factorItems.length) * 360;
      setRotationAngle(270 - targetAngle);
    }
  };

  const getNodePosition = (index, total) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const stageW = containerRef.current?.offsetWidth ?? 380;
    const radius = Math.min(155, stageW * 0.39);
    const radian = (angle * Math.PI) / 180;
    const x = radius * Math.cos(radian);
    const y = radius * Math.sin(radian);
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = Math.max(0.4, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2));
    return { x, y, zIndex, opacity };
  };

  return (
    <div
      className="sb-orbital"
      ref={containerRef}
      onClick={handleBackgroundClick}
    >
      <div className="sb-orbital__stage" ref={orbitRef}>
        {/* Center pulsing core */}
        <div className="sb-orbital__core">
          <div className="sb-orbital__core-ring sb-orbital__core-ring--1" />
          <div className="sb-orbital__core-ring sb-orbital__core-ring--2" />
          <div className="sb-orbital__core-inner">
            <span className="sb-orbital__core-score">{formattedScore}</span>
          </div>
        </div>

        {/* Orbit ring */}
        <div className="sb-orbital__ring" />

        {/* Factor nodes */}
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
              onClick={(e) => {
                e.stopPropagation();
                toggleNode(item.key);
              }}
            >
              {/* Glow aura — sized by score */}
              <div
                className="sb-orbital__node-glow"
                style={{
                  width: `${item.score * 5 + 36}px`,
                  height: `${item.score * 5 + 36}px`,
                  background: `radial-gradient(circle, ${scoreColor(item.score)}30 0%, transparent 70%)`,
                }}
              />

              {/* Node circle — color + size reflect score */}
              <div
                className={`sb-orbital__node-circle ${
                  isExpanded ? "sb-orbital__node-circle--active" : ""
                }`}
                style={{
                  width: `${28 + item.score * 2}px`,
                  height: `${28 + item.score * 2}px`,
                  borderColor: scoreColor(item.score),
                  background: isExpanded
                    ? scoreColor(item.score)
                    : `${scoreColor(item.score)}18`,
                  boxShadow: `0 0 ${item.score * 1.5}px ${scoreColor(item.score)}44`,
                }}
              >
                <Icon size={isExpanded ? 16 : Math.max(12, 10 + item.score * 0.5)} />
              </div>

              {/* Label + score */}
              <div
                className={`sb-orbital__node-label ${
                  isExpanded ? "sb-orbital__node-label--active" : ""
                }`}
              >
                <span>{item.label}</span>
                <span
                  className="sb-orbital__node-score"
                  style={{ color: scoreColor(item.score) }}
                >
                  {item.score.toFixed(1)}
                </span>
              </div>

              {/* Expanded card */}
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
                    <CardTitle className="text-sm mt-1.5 text-white">
                      {item.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0 text-xs text-white/80">
                    <p>{item.description}</p>
                    <div className="mt-3 pt-2 border-t border-white/10">
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="flex items-center gap-1 text-white/60">
                          <Zap size={10} />
                          Score
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

      {verdict ? (
        <div className="sb-orbital__verdict">{verdict}</div>
      ) : null}
    </div>
  );
}

export default function ScoreBreakdownModal({
  playerName,
  score,
  verdict,
  factors,
  reasoning,
  onClose,
}) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const factorItems = resolveFactorItems(factors);

  return (
    <div
      className="sb-overlay"
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Score détaillé de ${playerName}`}
    >
      <div className="sb-modal">
        <button className="sb-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>

        <header className="sb-header">
          <h2 className="sb-title">Card Metrics Score</h2>
          <p className="sb-player">{playerName}</p>
        </header>

        <OrbitalTimeline
          factorItems={factorItems}
          score={score}
          verdict={verdict}
        />

        {reasoning ? (
          <div className="sb-reasoning">
            <p className="sb-reasoning__label">Analyse</p>
            <p className="sb-reasoning__text">{reasoning}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
