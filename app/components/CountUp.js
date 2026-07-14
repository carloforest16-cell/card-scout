"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up from 0 to `value` when entering the viewport.
 * Adds a subtle cyan flash when the count completes.
 */
export default function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1200,
  className = "",
}) {
  const ref = useRef(null);
  const target = Number(value) || 0;
  // État initial = valeur finale (jamais 0). Une vraie donnée ne doit JAMAIS
  // s'afficher à 0 : SSR, crawlers, onglets en arrière-plan (rAF gelé) et
  // prefers-reduced-motion voyaient « 0.0 » sur /opportunites et « 0+ joueurs ».
  // On anime la présentation uniquement quand c'est visible et permis.
  const [shown, setShown] = useState(target);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Onglet caché ou animations réduites → on garde la valeur finale, pas d'anim.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || document.hidden) {
      setShown(target);
      return;
    }
    let rafId = 0;
    let cancelled = false;
    const runAnimation = () => {
      setShown(0);
      const start = performance.now();
      const tick = (now) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(target * eased);
        if (t < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          setShown(target);
          setDone(true);
          setTimeout(() => setDone(false), 700);
        }
      };
      rafId = requestAnimationFrame(tick);
    };
    const isInViewport = () => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
    };
    if (isInViewport()) {
      runAnimation();
      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
      };
    }
    const onScroll = () => {
      if (isInViewport()) {
        window.removeEventListener("scroll", onScroll);
        runAnimation();
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
    };
  }, [target, duration]);

  const formatted =
    decimals > 0
      ? shown.toFixed(decimals)
      : Math.round(shown).toLocaleString("fr-CA");

  return (
    <span
      ref={ref}
      className={`cn-countup ${done ? "is-flash" : ""} ${className}`}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
