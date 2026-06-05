"use client";

import { useEffect, useState } from "react";

/**
 * Fixed 2px progress bar at top of viewport.
 * Gradient ice → gold proportional to page scroll.
 */
export default function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? Math.min(100, Math.max(0, (h.scrollTop / max) * 100)) : 0;
      setPct(p);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    tick();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="cn-progress" aria-hidden>
      <div className="cn-progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}
