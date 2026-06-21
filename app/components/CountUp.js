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
  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);
  const target = Number(value) || 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let rafId = 0;
    let cancelled = false;
    const runAnimation = () => {
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
