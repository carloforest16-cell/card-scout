"use client";

/* Effets ambiants "WOW" : spotlight souris, marquee vélocité, cartes flottantes.
   Tous décoratifs (aria-hidden), désactivés en reduced-motion / pointeur tactile. */

import { useEffect, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";

const HW_EASE = [0.22, 1, 0.36, 1];

function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    setFine(window.matchMedia("(pointer: fine)").matches);
  }, []);
  return fine;
}

/* ─── Spotlight — halo glace qui suit le curseur ────────────────────────────── */

export function MouseSpotlight() {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  const mx = useMotionValue(-800);
  const my = useMotionValue(-800);
  const x = useSpring(mx, { stiffness: 90, damping: 22, mass: 0.6 });
  const y = useSpring(my, { stiffness: 90, damping: 22, mass: 0.6 });

  useEffect(() => {
    if (reduced || !fine) return;
    const onMove = (e) => { mx.set(e.clientX); my.set(e.clientY); };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, fine, mx, my]);

  if (reduced || !fine) return null;
  return <motion.div className="hw-spotlight" aria-hidden style={{ left: x, top: y }} />;
}

/* ─── Marquee brand — réagit à la vélocité du scroll ────────────────────────── */

const wrapRange = (min, max, v) => {
  const range = max - min;
  return ((((v - min) % range) + range) % range) + min;
};

export function BrandMarquee() {
  const reduced = useReducedMotion();
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 380 });
  const boost = useTransform(smooth, [-1400, 1400], [-4, 4], { clamp: false });
  const x = useTransform(baseX, (v) => `${wrapRange(-25, 0, v)}%`);

  useAnimationFrame((t, delta) => {
    if (reduced) return;
    let moveBy = -0.7 * (delta / 1000);
    moveBy += moveBy * Math.abs(boost.get());
    baseX.set(baseX.get() + moveBy);
  });

  const text = "CARD METRICS · INTELLIGENCE CARTES NHL · ";
  return (
    <div className="hw-marquee" aria-hidden>
      <motion.div className="hw-marquee__track" style={{ x }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="hw-marquee__text">{text}</span>
        ))}
      </motion.div>
    </div>
  );
}

/* ─── Cartes flottantes du hero — parallaxe souris, contenu = vrais deals ───── */

const FLOAT_CARDS = [
  {
    key: "a",
    verdict: "ACHETER",
    tone: "profit",
    type: "Young Guns RC",
    grade: "Raw",
    price: "$38.00",
    score: "8.9",
    delta: "−22% vs cote",
    depth: { x: 26, y: 18 },
    delay: 1.9,
  },
  {
    key: "b",
    verdict: "SURVEILLER",
    tone: "warn",
    type: "O-Pee-Chee RC",
    grade: "PSA 9",
    price: "$72.00",
    score: "7.5",
    delta: "±0% vs cote",
    depth: { x: -34, y: -22 },
    delay: 2.1,
  },
];

export function HeroFloatingCards() {
  const reduced = useReducedMotion();
  const fine = useFinePointer();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 18 });
  const sy = useSpring(my, { stiffness: 55, damping: 18 });

  // hooks appelés inconditionnellement (règles des hooks)
  const ax = useTransform(sx, (v) => v * FLOAT_CARDS[0].depth.x);
  const ay = useTransform(sy, (v) => v * FLOAT_CARDS[0].depth.y);
  const bx = useTransform(sx, (v) => v * FLOAT_CARDS[1].depth.x);
  const by = useTransform(sy, (v) => v * FLOAT_CARDS[1].depth.y);
  const cx = useTransform(sx, (v) => v * 14);
  const cy = useTransform(sy, (v) => v * -12);
  const layerStyles = [
    { x: ax, y: ay },
    { x: bx, y: by },
  ];

  useEffect(() => {
    if (reduced || !fine) return;
    const onMove = (e) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, fine, mx, my]);

  return (
    <div className="hw-float" aria-hidden>
      {FLOAT_CARDS.map((c, i) => (
        <motion.div
          key={c.key}
          className={`hw-float__layer hw-float__layer--${c.key}`}
          style={reduced ? undefined : layerStyles[i]}
        >
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: c.delay, duration: 0.9, ease: HW_EASE }}
          >
            <div className={`hw-float__card hw-float__idle--${c.key}`}>
              <div className="hw-float__head">
                <span className={`cn-badge cn-badge--${c.tone}`}>
                  <span className="cn-badge__dot" aria-hidden />
                  {c.verdict}
                </span>
                <span className="hw-float__score">
                  {c.score}<span className="hw-float__score-max">/10</span>
                </span>
              </div>
              <p className="hw-float__type">{c.type}</p>
              <p className="hw-float__grade">{c.grade}</p>
              <div className="hw-float__foot">
                <span className="hw-float__price">{c.price}</span>
                <span className={`hw-float__delta hw-float__delta--${c.tone}`}>{c.delta}</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ))}

      {/* chip Score IA */}
      <motion.div
        className="hw-float__layer hw-float__layer--c"
        style={reduced ? undefined : { x: cx, y: cy }}
      >
        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 2.3, duration: 0.9, ease: HW_EASE }}
        >
          <div className="hw-float__chip hw-float__idle--c">
            <span className="hw-float__chip-label">CARD METRICS SCORE</span>
            <span className="hw-float__chip-val">8.2<span>/10</span></span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
