"use client";

/* eslint-disable @next/next/no-img-element */

/* Section cinématique épinglée : "De la stats au verdict. En 3 étapes."
   Le viewport se fige pendant ~3 écrans de scroll ; le mockup navigateur
   se transforme selon la phase (scan stats → score IA → verdict).
   Mobile / reduced-motion : version empilée statique, sans pin. */

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "framer-motion";

import { SCORE_WEIGHTS_BY_KEY, weightToPct } from "@/lib/cardScoutScoreMath";

const HW_EASE = [0.22, 1, 0.36, 1];

const STORY_STEPS = [
  {
    num: "01",
    title: "Analyse",
    body: "L'IA scanne les stats NHL en temps réel — performance, trajectoire, âge, momentum, marché. 15+ variables croisées par joueur.",
  },
  {
    num: "02",
    title: "Score",
    body: "Un Card Metrics Score 0-10 généré en moins de 3 secondes. Chaque facteur pèse selon son impact réel sur la valeur des cartes.",
  },
  {
    num: "03",
    title: "Opportunité",
    body: "Un verdict actionnable — Acheter, Chercher mieux ou Passer — avec les listings eBay live correspondants et les alternatives moins chères.",
  },
];

const SCAN_ROWS = [
  { label: "Performance", val: "70 PTS · 82 GP" },
  { label: "Momentum 10 matchs", val: "+18%" },
  { label: "Âge", val: "24 ans" },
  { label: "Marché eBay CA", val: "142 annonces" },
  { label: "Hype 7 jours", val: "en hausse" },
];

// Poids (weight) tirés de SCORE_WEIGHTS_BY_KEY (source unique, lib/cardScoutScoreMath.js
// — tâche 3.1 du plan). `pct`/`color` restent locaux : c'est un mockup illustratif,
// pas le vrai score d'un joueur.
const FACTORS = [
  { key: "performance", label: "Performance", pct: 88, color: "var(--ice)" },
  { key: "momentum", label: "Momentum", pct: 93, color: "var(--profit)" },
  { key: "upside", label: "Upside", pct: 85, color: "var(--gold)" },
  { key: "marketValue", label: "Marché", pct: 82, color: "var(--ice)" },
  { key: "hype", label: "Hype", pct: 79, color: "var(--gold)" },
].map((f) => ({ ...f, weight: `${weightToPct(SCORE_WEIGHTS_BY_KEY[f.key])}%` }));

/* compteur 0 → 8.2 quand la phase Score devient active */
function ScoreCount({ active }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / 1100, 1);
      setVal(8.2 * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return <>{val.toFixed(1)}</>;
}

function PlayerRow() {
  return (
    <div className="hs-ph__player">
      <img
        src="https://assets.nhle.com/mugs/nhl/20242025/MTL/8481540.png"
        alt="" width={44} height={55}
        className="hs-ph__avatar"
        loading="lazy"
      />
      <div>
        <p className="hs-ph__name">Cole Caufield</p>
        <p className="hs-ph__meta"><span>MTL</span> · RW · #22</p>
      </div>
    </div>
  );
}

function PhaseAnalyse() {
  return (
    <div className="hs-ph">
      <PlayerRow />
      <div className="hs-ph__scan">
        {SCAN_ROWS.map((r, i) => (
          <motion.div
            key={r.label}
            className="hs-ph__scan-row"
            initial={{ opacity: 0, x: -14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.14, duration: 0.5, ease: HW_EASE }}
          >
            <span className="hs-ph__scan-label">{r.label}</span>
            <span className="hs-ph__scan-leader" aria-hidden />
            <span className="hs-ph__scan-val">{r.val}</span>
          </motion.div>
        ))}
        <div className="hs-ph__beam" aria-hidden />
      </div>
    </div>
  );
}

function PhaseScore({ active }) {
  return (
    <div className="hs-ph">
      <div className="hs-ph__score-top">
        <span className="hs-ph__score-label">CARD METRICS SCORE</span>
        <div className="hs-ph__score-big">
          <span className="hs-ph__score-num"><ScoreCount active={active} /></span>
          <span className="hs-ph__score-max">/10</span>
        </div>
      </div>
      <div className="hs-ph__factors">
        {FACTORS.map((f, i) => (
          <div key={f.label} className="hs-ph__factor">
            <div className="hs-ph__factor-head">
              <span className="hs-ph__factor-label">{f.label}</span>
              <span className="hs-ph__factor-weight">{f.weight}</span>
              <span className="hs-ph__factor-val" style={{ color: f.color }}>
                {(f.pct / 10).toFixed(1)}
              </span>
            </div>
            <div className="hs-ph__factor-track">
              <motion.div
                className="hs-ph__factor-fill"
                style={{ background: f.color, boxShadow: `0 0 8px ${f.color}` }}
                initial={{ width: 0 }}
                animate={{ width: `${f.pct}%` }}
                transition={{ delay: 0.2 + i * 0.13, duration: 0.8, ease: HW_EASE }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhaseVerdict() {
  return (
    <div className="hs-ph hs-ph--verdict">
      <motion.div
        className="hs-ph__stamp"
        initial={{ scale: 2.4, opacity: 0, rotate: -16 }}
        animate={{ scale: 1, opacity: 1, rotate: -5 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
      >
        ACHETER
      </motion.div>
      <motion.p
        className="hs-ph__verdict-sub"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.6, ease: HW_EASE }}
      >
        Annonce 18% sous la cote du marché. Joueur en momentum haussier, carte liquide.
      </motion.p>
      <motion.div
        className="hs-ph__alts"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6, ease: HW_EASE }}
      >
        <span className="hs-ph__alts-label">
          12 annonces eBay trouvées · 3 deals à regarder en priorité
        </span>
        <div className="hs-ph__alts-row">
          {["$38.00", "$41.50", "$43.00"].map((p) => (
            <span key={p} className="hs-ph__alt-chip">{p}</span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

const PHASE_URLS = [
  "cardmetrics.io/player/caufield",
  "cardmetrics.io/player/caufield#score",
  "cardmetrics.io/deals?player=Cole+Caufield",
];

export default function ScrollStory() {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const p = v < 1 / 3 ? 0 : v < 2 / 3 ? 1 : 2;
    setPhase((prev) => (prev === p ? prev : p));
  });

  const staticMode = Boolean(reduced);

  return (
    <section
      id="comment-ca-marche"
      ref={ref}
      className={`hs-story${staticMode ? " hs-story--static" : ""}`}
      aria-labelledby="hs-story-title"
    >
      <div className="hs-story__sticky">
        <header className="hs-story__head">
          <p className="cn-eyebrow hs-story__eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            COMMENT ÇA MARCHE
          </p>
          <h2 id="hs-story-title" className="cn-h2 hs-story__title">
            DE LA STATS AU VERDICT. EN&nbsp;3&nbsp;ÉTAPES.
          </h2>
          <p className="cn-body hs-story__sub">
            Chaque carte hockey vendue sur eBay est un signal. Card Metrics les transforme en décisions.
          </p>
        </header>

        <div className="hs-story__grid">
          <div className="hs-story__copy">
            {STORY_STEPS.map((s, i) => (
              <div
                key={s.num}
                className={`hs-step${i === phase ? " hs-step--active" : ""}`}
              >
                <span className="hs-step__num">ÉTAPE {s.num}</span>
                <h3 className="hs-step__title">{s.title}</h3>
                <p className="hs-step__body">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="hs-story__visual" aria-hidden>
            <div className="hs-story__frame">
              <div className="hc-score-mock__chrome">
                <span className="hc-score-mock__dot hc-score-mock__dot--red" />
                <span className="hc-score-mock__dot hc-score-mock__dot--yellow" />
                <span className="hc-score-mock__dot hc-score-mock__dot--green" />
                <span className="hc-score-mock__url">{PHASE_URLS[phase]}</span>
              </div>
              <div className="hs-story__stage">
                <AnimatePresence initial={false}>
                  <motion.div
                    key={phase}
                    className="hs-story__stage-inner"
                    initial={{ opacity: 0, y: 24, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -24, scale: 0.985 }}
                    transition={{ duration: 0.45, ease: HW_EASE }}
                  >
                    {phase === 0 && <PhaseAnalyse />}
                    {phase === 1 && <PhaseScore active />}
                    {phase === 2 && <PhaseVerdict />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        <div className="hs-story__rail" aria-hidden>
          <div className="hs-story__rail-track">
            <motion.div
              className="hs-story__rail-fill"
              style={{ scaleX: scrollYProgress }}
            />
          </div>
          <div className="hs-story__rail-labels">
            {STORY_STEPS.map((s, i) => (
              <span
                key={s.num}
                className={`hs-story__rail-num${i === phase ? " hs-story__rail-num--active" : ""}`}
              >
                {s.num}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
