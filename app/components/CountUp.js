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
    let started = false;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          const start = performance.now();
          const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            setShown(target * eased);
            if (t < 1) requestAnimationFrame(tick);
            else {
              setShown(target);
              setDone(true);
              setTimeout(() => setDone(false), 700);
            }
          };
          requestAnimationFrame(tick);
          obs.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
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
