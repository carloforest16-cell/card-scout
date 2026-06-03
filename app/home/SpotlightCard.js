"use client";

import { useRef } from "react";

/**
 * Card with a cursor-following radial spotlight on hover.
 * Wrap any content with this to get the halo effect.
 */
export default function SpotlightCard({ children, className = "", color = "red" }) {
  const ref = useRef(null);

  const handleMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--sy", `${e.clientY - rect.top}px`);
  };

  const handleMouseLeave = () => {
    const el = ref.current;
    if (el) {
      el.style.setProperty("--sx", "-9999px");
      el.style.setProperty("--sy", "-9999px");
    }
  };

  return (
    <div
      ref={ref}
      className={`cs-spotlight cs-spotlight--${color} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}
