"use client";

import { useEffect, useRef, useState } from "react";

import CountUp from "./CountUp";

/**
 * 180° semicircular score gauge (Card Metrics Score 0-10).
 * Draws itself on viewport entry over 1.5s, gradient stroke loss→ice→gold.
 */
export default function ScoreGauge({ score = 0, label = "Card Metrics Score", size = 200 }) {
  const ref = useRef(null);
  const v = Math.max(0, Math.min(10, Number(score) || 0));
  // État initial = valeur réelle (arc rempli correctement). Une vraie donnée ne
  // doit jamais s'afficher vide/à 0 : SSR, crawlers, onglet caché (rAF/IO gelés)
  // et prefers-reduced-motion voyaient une jauge à 0. Le draw-in n'est qu'une
  // animation de présentation jouée à l'entrée dans le viewport.
  const [drawn, setDrawn] = useState(v);
  const arcRef = useRef(null);

  // arc geometry
  const cx = 100;
  const cy = 100;
  const r = 80;
  const startAngle = Math.PI;     // 180°
  const endAngle = 2 * Math.PI;   // 360° / 0°
  const arcLen = Math.PI * r;     // half circumference
  const t = drawn / 10;
  const dashOffset = arcLen * (1 - t);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Animations réduites → on garde l'arc rempli (valeur finale), aucune anim.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setDrawn(v);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        // Draw-in propre : on supprime la transition, on remet l'arc à vide,
        // on force un reflow, puis on restaure la transition et on trace jusqu'à v.
        const arc = arcRef.current;
        if (arc) {
          const t = arc.style.transition;
          arc.style.transition = "none";
          setDrawn(0);
          // force reflow pour que le passage à 0 soit appliqué sans transition
          void arc.getBoundingClientRect();
          requestAnimationFrame(() => {
            arc.style.transition = t || "";
            setDrawn(v);
          });
        } else {
          setDrawn(v);
        }
        obs.disconnect();
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [v]);

  // big half-circle arc
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  return (
    <div
      ref={ref}
      className="cn-gauge"
      style={{ width: size, height: size * 0.62 }}
    >
      <svg viewBox="0 0 200 124" className="cn-gauge__svg" aria-hidden>
        <defs>
          <linearGradient id="cn-gauge-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="35%" stopColor="#00D4FF" />
            <stop offset="100%" stopColor="#FFB800" />
          </linearGradient>
          <filter id="cn-gauge-glow">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>
        <path d={arcPath} stroke="#1E293B" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path
          ref={arcRef}
          d={arcPath}
          stroke="url(#cn-gauge-grad)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div className="cn-gauge__label">
        <span className="cn-gauge__value">
          <CountUp value={score} decimals={1} duration={1500} />
        </span>
        <span className="cn-gauge__caption">{label}</span>
      </div>
    </div>
  );
}
