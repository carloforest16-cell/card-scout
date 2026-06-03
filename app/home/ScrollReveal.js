"use client";

import { useEffect, useRef } from "react";

/**
 * Reveals children when they enter the viewport via IntersectionObserver.
 * Adds "sr-visible" class to trigger CSS transition defined in home-premium.css.
 *
 * @param {{ children: React.ReactNode, as?: string, className?: string, delay?: number, variant?: "up" | "scale" | "fade" }} props
 */
export default function ScrollReveal({
  children,
  as: Tag = "div",
  className = "",
  delay = 0,
  variant = "up",
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("sr-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`sr sr--${variant} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
