"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";

function fmt(n) {
  const x = Number(n);
  return Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : "—";
}

function MomentumBar({ value, max = 10, color }) {
  const pct = Math.min(100, Math.max(0, (Number(value) / max) * 100));
  return (
    <div className="pulse-bar" aria-hidden>
      <div className="pulse-bar__fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function PlayerCard({ p, metric, metricLabel, color, badge }) {
  return (
    <Reveal>
      <Link href={`/player/${p.playerId}`} className="pulse-card">
        {p.headshotUrl ? (
          <img src={p.headshotUrl} alt="" className="pulse-card__img" loading="lazy" />
        ) : (
          <div className="pulse-card__img pulse-card__img--ph" aria-hidden />
        )}
        <div className="pulse-card__body">
          <div className="pulse-card__top">
            <span className="pulse-card__name">{p.playerName}</span>
            {badge && <span className="pulse-card__badge" style={{ color, borderColor: color }}>{badge}</span>}
          </div>
          <span className="pulse-card__team cn-mono">{p.team ?? "—"}</span>
          <MomentumBar value={p[metric]} color={color} />
          <div className="pulse-card__stats cn-mono">
            <span style={{ color }}>{metricLabel} {fmt(p[metric])}</span>
            <span className="pulse-card__score">Score {fmt(p.score)}</span>
          </div>
          {p.reasoning ? (
            <p className="pulse-card__reason">{p.reasoning.slice(0, 100)}{p.reasoning.length > 100 ? "…" : ""}</p>
          ) : null}
        </div>
      </Link>
    </Reveal>
  );
}

function Section({ title, eyebrow, players, metric, metricLabel, color, badge, emptyMsg }) {
  if (!players?.length) return null;
  return (
    <section className="pulse-section">
      <Reveal as="header" className="pulse-section__head">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" aria-hidden style={{ background: color }} />
          {eyebrow}
        </p>
        <h2 className="cn-h2">{title}</h2>
      </Reveal>
      {players.length === 0 ? (
        <p className="pulse-empty">{emptyMsg}</p>
      ) : (
        <div className="pulse-grid">
          {players.map((p) => (
            <PlayerCard key={p.playerId} p={p} metric={metric} metricLabel={metricLabel} color={color} badge={badge} />
          ))}
        </div>
      )}
    </section>
  );
}

function timeAgo(isoDate) {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  if (ms < 0) return "à l'instant";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

const FEED_ICONS = {
  TRADE: "🔄",
  INJURY: "🤕",
  CONTRAT: "✍️",
  DRAFT: "⚡",
  NEWS: "📰",
};

function NHLFeedSection() {
  const [feed, setFeed] = useState(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const tickRef = useRef(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    fetch("/api/nhl-feed")
      .then((r) => r.json())
      .then((d) => setFeed(d))
      .catch(() => setFeed({ ok: false, items: [] }))
      .finally(() => setFeedLoading(false));
  }, []);

  // Refresh "il y a X min" chaque minute
  useEffect(() => {
    tickRef.current = setInterval(() => forceUpdate((n) => n + 1), 60000);
    return () => clearInterval(tickRef.current);
  }, []);

  const items = Array.isArray(feed?.items) ? feed.items : [];

  return (
    <section className="pulse-section pulse-feed-section">
      <Reveal as="header" className="pulse-section__head">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" aria-hidden style={{ background: "#60a5fa" }} />
          ALERTES NHL · TRADES · CONTRATS · BLESSURES
        </p>
        <h2 className="cn-h2">NHL <span className="cn-h1__ice">ALERTES</span></h2>
      </Reveal>

      {feedLoading ? (
        <div className="pulse-feed__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="pulse-feed__skel-row" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="pulse-feed__empty">Aucune alerte NHL pour l&apos;instant.</p>
      ) : (
        <ul className="pulse-feed" role="list">
          {items.slice(0, 20).map((item, idx) => (
            <li key={idx} className="pulse-feed__item">
              <span
                className="pulse-feed__tag"
                style={{ "--tag-color": item.color }}
                title={item.label}
              >
                {FEED_ICONS[item.type] ?? "📰"} {item.label}
              </span>
              <a
                href={item.link ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="pulse-feed__title"
              >
                {item.title}
              </a>
              <span className="pulse-feed__meta cn-mono">
                {timeAgo(item.pubDate)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="pulse-feed__source cn-mono">Source · Sportsnet NHL</p>
    </section>
  );
}

export default function PulseClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/pulse")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="pulse-page cinematic">
      <ScrollProgress />
      <Atmosphere />
      <div className="pulse-rail">
        <AppNav active="pulse" />
      </div>

      <main className="pulse-main">
        <Reveal as="header" className="pulse-hero">
          <p className="cn-eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            MARCHÉ · TEMPS RÉEL · NHL CARDS
          </p>
          <h1 className="cn-h1">MARKET <span className="cn-h1__ice">PULSE</span></h1>
          <p className="pulse-hero__sub">
            Le radar des cartes NHL — qui monte, qui descend, qui explose.
          </p>
          {data?.updatedAt && (
            <p className="pulse-hero__date cn-mono">
              Mis à jour · {new Date(data.updatedAt).toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}
            </p>
          )}
        </Reveal>

        {loading && (
          <div className="pulse-skeleton-wrap">
            {[...Array(8)].map((_, i) => <div key={i} className="pulse-skel" />)}
          </div>
        )}

        {error && <p className="pulse-error">Impossible de charger le Market Pulse : {error}</p>}

        {data && (
          <>
            <Section
              title={<>EN <span className="cn-h1__ice">FEU</span></>}
              eyebrow="MOMENTUM MAXIMAL"
              players={data.enFeu}
              metric="momentum"
              metricLabel="Momentum"
              color="#f97316"
              badge="🔥 En feu"
              emptyMsg="Aucun joueur en feu pour l'instant."
            />
            <Section
              title={<>BREAKOUT <span className="cn-h1__ice">ALERTS</span></>}
              eyebrow="STARS ÉMERGENTES · À ACHETER AVANT LA HYPE"
              players={data.breakout}
              metric="upside"
              metricLabel="Upside"
              color="#a78bfa"
              badge="⚡ Breakout"
              emptyMsg="Aucun breakout détecté."
            />
            <Section
              title={<>VALEUR <span className="cn-h1__ice">CACHÉE</span></>}
              eyebrow="SOUS LE RADAR · SCORE FORT · HYPE FAIBLE"
              players={data.valeurCachee}
              metric="score"
              metricLabel="Score"
              color="#34d399"
              badge="💎 Sous-côté"
              emptyMsg="Aucune valeur cachée détectée."
            />
            <Section
              title={<>EN <span className="cn-h1__ice">BAISSE</span></>}
              eyebrow="MOMENTUM FAIBLE · ÉVITER OU ATTENDRE"
              players={data.enBaisse}
              metric="momentum"
              metricLabel="Momentum"
              color="#f87171"
              badge="📉 En baisse"
              emptyMsg="Aucun joueur en baisse détecté."
            />
          </>
        )}

        <NHLFeedSection />
      </main>
    </div>
  );
}
