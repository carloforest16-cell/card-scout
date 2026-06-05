"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hero title where each letter fades + slides in individually with a 40ms stagger.
 * Triggers on mount (above-the-fold).
 */
export default function AnimatedTitle({
  text,
  iceWord,
  as: Tag = "h1",
  className = "",
  delayMs = 200,
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  const renderChars = (str, baseDelay) => {
    let counter = baseDelay;
    return Array.from(str).map((ch, i) => {
      const isSpace = ch === " " || ch === " ";
      const d = isSpace ? counter : (counter += 40);
      return (
        <span
          key={`${ch}-${i}`}
          className="cn-title-char"
          style={{
            transitionDelay: `${d}ms`,
            transform: mounted ? "translateY(0)" : "translateY(40px)",
            opacity: mounted ? 1 : 0,
            filter: mounted ? "blur(0)" : "blur(6px)",
          }}
        >
          {isSpace ? " " : ch}
        </span>
      );
    });
  };

  return (
    <Tag className={`cn-anim-title ${className}`} aria-label={`${text} ${iceWord ?? ""}`.trim()}>
      <span className="cn-title-line" aria-hidden>{renderChars(text, 0)}</span>
      {iceWord ? (
        <>
          {" "}
          <span className="cn-title-line cn-title-line--ice" aria-hidden>
            {renderChars(iceWord, text.length * 40)}
          </span>
        </>
      ) : null}
    </Tag>
  );
}
