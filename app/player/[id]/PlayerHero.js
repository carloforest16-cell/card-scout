"use client";

/* eslint-disable @next/next/no-img-element -- URLs NHLE / officielles */
import { useEffect, useRef, useState } from "react";

import AlertButton from "../../components/AlertButton";
import FollowButton from "../../components/FollowButton";
import ScoreGauge from "../../components/ScoreGauge";
import ScoreBreakdownModal from "./ScoreBreakdownModal";

function verdictTone(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "buy";
  if (v.includes("éviter") || v.includes("eviter") || v.includes("passer"))
    return "avoid";
  return "watch";
}

function verdictBadgeClass(tone) {
  if (tone === "buy") return "cn-badge--profit";
  if (tone === "avoid") return "cn-badge--loss";
  return "cn-badge--gold";
}

/**
 * @param {object} props
 * @param {string} props.playerId
 * @param {string} props.fullName
 * @param {string} props.team
 * @param {string} props.position
 * @param {string} props.sweater
 * @param {string} props.headshotUrl
 * @param {string | null} props.teamLogoUrl
 */
export default function PlayerHero({
  playerId,
  fullName,
  team,
  position,
  sweater,
  headshotUrl,
  teamLogoUrl,
}) {
  const [score, setScore] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [factors, setFactors] = useState(null);
  const [reasoning, setReasoning] = useState(null);
  const [scoreState, setScoreState] = useState("loading");
  const [showBreakdown, setShowBreakdown] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const tone = verdict ? verdictTone(verdict) : "watch";

  return (
    <>
      <header className="pl-hero">
        <div className="pl-hero__photo">
          <img
            className="pl-hero__photo-img"
            src={headshotUrl}
            alt={`Portrait ${fullName}`}
            width={420}
            height={420}
            fetchPriority="high"
            decoding="async"
          />
        </div>

        <div className="pl-hero__info">
          <p className="cn-eyebrow pl-hero__eyebrow">
            {teamLogoUrl ? (
              <img
                className="pl-hero__logo"
                src={teamLogoUrl}
                alt=""
                width={36}
                height={36}
                loading="lazy"
              />
            ) : (
              <span className="cn-eyebrow__dot" aria-hidden />
            )}
            PROFIL JOUEUR
          </p>
          <h1 className="cn-h1 pl-hero__name">{fullName}</h1>
          <div className="pl-hero__follow">
            <FollowButton
              playerId={playerId}
              playerName={fullName}
              playerTeam={team}
              playerPosition={position}
              headshotUrl={headshotUrl}
            />
            <AlertButton playerId={playerId} playerName={fullName} />
          </div>
          <p className="cn-label pl-hero__meta">
            {team}
            <span className="pl-hero__meta-sep" aria-hidden>
              /
            </span>
            {position}
            <span className="pl-hero__meta-sep" aria-hidden>
              /
            </span>
            {sweater}
          </p>
        </div>

        <div className="pl-hero__score">
          {scoreState === "ready" ? (
            <>
              <button
                className="pl-hero__score-btn"
                onClick={() => setShowBreakdown(true)}
                aria-label="Voir le détail du score"
                title="Voir le détail du score"
              >
                <ScoreGauge score={score ?? 0} label="CARD SCOUT SCORE" size={200} />
                <span className="pl-hero__score-hint cn-mono">DÉTAILS ›</span>
              </button>
              {verdict ? (
                <span className={`cn-badge ${verdictBadgeClass(tone)} pl-hero__verdict`}>
                  <span className="cn-badge__dot" aria-hidden />
                  {verdict}
                </span>
              ) : null}
            </>
          ) : scoreState === "loading" ? (
            <div className="pl-hero__score-skel" aria-busy="true">
              <span className="cn-mono pl-hero__score-skel-text">CALCUL DU SCORE…</span>
            </div>
          ) : (
            <div className="pl-hero__score-skel">
              <span className="cn-mono pl-hero__score-skel-text">SCORE INDISPONIBLE</span>
            </div>
          )}
        </div>
      </header>

      {showBreakdown && factors ? (
        <ScoreBreakdownModal
          playerName={fullName}
          score={score}
          verdict={verdict}
          factors={factors}
          reasoning={reasoning}
          onClose={() => setShowBreakdown(false)}
        />
      ) : null}
    </>
  );
}
