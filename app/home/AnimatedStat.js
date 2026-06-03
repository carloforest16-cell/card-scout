"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Stat card that animates the number when it enters the viewport.
 * Non-numeric values are displayed as-is with a fade-in.
 */
export default function AnimatedStat({ value, suffix = "", label, accent }) {
  const numeric = parseInt(value, 10);
  const isNumeric = !isNaN(numeric);
  const [displayed, setDisplayed] = useState(isNumeric ? `0${suffix}` : value);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (!isNumeric) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const totalFrames = 55;
          const durationMs = 1300;
          const frameMs = durationMs / totalFrames;
          let frame = 0;

          const tick = () => {
            frame++;
            const t = frame / totalFrames;
            const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
            const current = Math.round(eased * numeric);
            setDisplayed(frame < totalFrames ? `${current}${suffix}` : `${numeric}${suffix}`);
            if (frame < totalFrames) setTimeout(tick, frameMs);
          };
          tick();
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isNumeric, numeric, suffix]);

  return (
    <div ref={ref} className={`hp-stat hp-stat--${accent}`}>
      <p className="hp-stat__value" aria-live="polite">
        {displayed}
      </p>
      <p className="hp-stat__label">{label}</p>
    </div>
  );
}
