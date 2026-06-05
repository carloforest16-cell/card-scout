/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Note: useEffect/useState kept for auto-rotate, mouse parallax, keyboard nav

function fmtScore(s) {
  if (s == null || Number.isNaN(Number(s))) return "—";
  return Number(s).toFixed(1);
}

function tierClass(tier) {
  if (tier === "high") return "cs-coverflow__score--high";
  if (tier === "mid") return "cs-coverflow__score--mid";
  return "cs-coverflow__score--low";
}

/**
 * 3D Coverflow-style player showcase.
 * Players arrive pre-scored and pre-sorted from the server (trendingData.js).
 */
export default function HomePremium3DShowcase({ players }) {
  // Players are already sorted by score descending from the server — take top 9
  const items = useMemo(
    () => (players ?? []).filter((p) => p?.id && p.headshotUrl).slice(0, 9),
    [players]
  );

  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const sceneRef = useRef(null);

  // auto-rotate
  useEffect(() => {
    if (items.length === 0 || hovered) return undefined;
    const id = setInterval(() => {
      setActive((i) => (i + 1) % items.length);
    }, 3800);
    return () => clearInterval(id);
  }, [items.length, hovered]);

  // mouse parallax
  const handleMouseMove = useCallback((e) => {
    const el = sceneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width - 0.5;
    const cy = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: cy * -6, y: cx * 10 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    setTilt({ x: 0, y: 0 });
  }, []);

  const goPrev = useCallback(() => {
    setActive((i) => (i - 1 + items.length) % items.length);
  }, [items.length]);

  const goNext = useCallback(() => {
    setActive((i) => (i + 1) % items.length);
  }, [items.length]);

  // keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  if (items.length === 0) {
    return <div className="cs-coverflow cs-coverflow--empty" aria-hidden />;
  }

  return (
    <div
      className="cs-coverflow"
      role="region"
      aria-label="Profils NHL trending"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      <div
        ref={sceneRef}
        className="cs-coverflow__scene"
        style={{
          transform: `perspective(1400px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        }}
      >
        {items.map((p, i) => {
          const offset = i - active;
          const half = Math.floor(items.length / 2);
          // wrap offset to shortest path
          let rel = offset;
          if (rel > half) rel -= items.length;
          if (rel < -half) rel += items.length;

          const abs = Math.abs(rel);
          if (abs > 3) {
            return null; // hide cards too far away for perf
          }

          const isActive = rel === 0;
          const x = rel * 180;       // horizontal offset (px)
          const z = -Math.abs(rel) * 220; // depth
          const rotY = rel === 0 ? 0 : rel > 0 ? -38 : 38;
          const scale = isActive ? 1 : Math.max(0.62, 1 - abs * 0.14);
          const opacity = isActive ? 1 : Math.max(0.22, 1 - abs * 0.32);
          const zIndex = 10 - abs;

          return (
            <button
              key={p.id}
              type="button"
              className={`cs-coverflow__card ${isActive ? "is-active" : ""} ${
                abs === 1 ? "is-neighbor" : ""
              }`}
              onClick={() => setActive(i)}
              aria-label={`Voir ${p.name}, score IA ${fmtScore(p.score)} sur 10`}
              aria-current={isActive ? "true" : undefined}
              style={{
                transform: `translate3d(${x}px, 0, ${z}px) rotateY(${rotY}deg) scale(${scale})`,
                opacity,
                zIndex,
                pointerEvents: abs > 2 ? "none" : "auto",
              }}
              tabIndex={isActive ? 0 : -1}
            >
              <span className="cs-coverflow__media">
                <img
                  src={p.headshotUrl}
                  alt=""
                  width={240}
                  height={300}
                  loading="lazy"
                  decoding="async"
                  draggable="false"
                />
                <span className={`cs-coverflow__score ${tierClass(p.tier)}`}>
                  <span className="cs-coverflow__score-val">{fmtScore(p.score)}</span>
                  <span className="cs-coverflow__score-max">/10</span>
                </span>
                <span className="cs-coverflow__shine" aria-hidden="true" />
                <span className="cs-coverflow__glow" aria-hidden="true" />
                <span className="cs-coverflow__overlay" aria-hidden="true">
                  <span className="cs-coverflow__name">{p.name}</span>
                  {isActive && (
                    <Link
                      href={`/player/${p.id}`}
                      className="cs-coverflow__cta"
                      tabIndex={-1}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Voir profil →
                    </Link>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* arrows */}
      <button
        type="button"
        className="cs-coverflow__arrow cs-coverflow__arrow--prev"
        onClick={goPrev}
        aria-label="Joueur précédent"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className="cs-coverflow__arrow cs-coverflow__arrow--next"
        onClick={goNext}
        aria-label="Joueur suivant"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {/* dot navigation */}
      <div className="cs-coverflow__dots" role="tablist" aria-label="Joueurs">
        {items.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`${p.name}`}
            className={`cs-coverflow__dot ${i === active ? "is-active" : ""}`}
            onClick={() => setActive(i)}
          />
        ))}
      </div>
    </div>
  );
}
