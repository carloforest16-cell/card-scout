"use client";

import { useEffect, useRef } from "react";

/**
 * Cinematic scroll-in reveal.
 * Initial: opacity 0, translateY(30px), scale(0.98), blur(4px)
 * Visible: all neutral
 * Triggers once when 15% of element enters the viewport.
 *
 * @param {{ children: React.ReactNode, as?: string, className?: string, index?: number, staggerMs?: number }} props
 */
export default function Reveal({
  children,
  as: Tag = "div",
  className = "",
  index = 0,
  staggerMs = 80,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          obs.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cappedIndex = Math.min(index, 5); // max 6 staggered items
  return (
    <Tag
      ref={ref}
      className={`cn-reveal ${className}`}
      style={
        cappedIndex > 0
          ? { transitionDelay: `${cappedIndex * staggerMs}ms` }
          : undefined
      }
    >
      {children}
    </Tag>
  );
}
