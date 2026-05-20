/* eslint-disable @next/next/no-img-element -- NHLE headshots */
"use client";

import Link from "next/link";
import { useMemo } from "react";

function formatAiScore(score) {
  if (score == null || Number.isNaN(Number(score))) return "—";
  return Number(score).toFixed(1);
}

function scoreToneClass(tier) {
  if (tier === "high") return "hp-hero-carousel__score hp-hero-carousel__score--high";
  if (tier === "mid") return "hp-hero-carousel__score hp-hero-carousel__score--mid";
  return "hp-hero-carousel__score hp-hero-carousel__score--low";
}

/**
 * @param {object} props
 * @param {Array<{ id: string; name: string; headshotUrl: string; score: number | null; tier?: string }>} props.players
 */
export default function HomePremiumHeroCarousel({ players }) {
  const items = useMemo(() => {
    const base = (players ?? []).filter((p) => p?.id && p.headshotUrl);
    if (base.length === 0) return [];
    return base.slice(0, 9);
  }, [players]);

  const durationSec = useMemo(() => {
    if (items.length === 0) return 36;
    return Math.min(56, Math.max(28, items.length * 3.4));
  }, [items.length]);

  if (items.length === 0) {
    return <div className="hp-hero-carousel hp-hero-carousel--empty" aria-hidden />;
  }

  return (
    <div className="hp-hero-carousel" role="region" aria-label="Profils NHL trending">
      <div className="hp-hero-carousel__mask">
        <div
          className="hp-hero-carousel__track"
          style={{ "--hp-marquee-sec": String(durationSec) }}
        >
          <div className="hp-hero-carousel__chunk">
            {items.map((p, i) => (
              <CarouselCard key={`a-${i}-${p.id}`} player={p} />
            ))}
          </div>
          <div className="hp-hero-carousel__chunk" aria-hidden="true">
            {items.map((p, i) => (
              <CarouselCard key={`b-${i}-${p.id}`} player={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{ player: { id: string; name: string; headshotUrl: string; score: number | null; tier?: string } }} props
 */
function CarouselCard({ player: p }) {
  const label = `Voir ${p.name}, score IA ${formatAiScore(p.score)} sur 10`;
  return (
    <Link href={`/player/${p.id}`} className="hp-hero-carousel__card" aria-label={label}>
      <div className="hp-hero-carousel__media">
        <img src={p.headshotUrl} alt="" width={176} height={220} loading="lazy" decoding="async" />
        <div className="hp-hero-carousel__overlay" aria-hidden="true">
          <span className={scoreToneClass(p.tier)}>{formatAiScore(p.score)}</span>
          <span className="hp-hero-carousel__name">{p.name}</span>
        </div>
      </div>
    </Link>
  );
}
