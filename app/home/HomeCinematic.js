/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useRecentPlayers } from "@/lib/useRecentPlayers";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";
import TiltCard from "../components/TiltCard";
import WelcomeTour from "../components/WelcomeTour";
import "../components/welcome-tour.css";
import ScoreCircuit from "./ScoreCircuit";

/* ─── Icons ─────────────────────────────────────────────────────────────────── */

const IconAnalyze = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5M11 7v8M7 11h8" />
  </svg>
);
const IconScore = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17a9 9 0 0 1 18 0" />
    <path d="M12 17l4-5" />
    <circle cx="12" cy="17" r="1.5" fill="currentColor" />
  </svg>
);
const IconTarget = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);
const IconArrow = ({ width = 18, height = 18, className = "" }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconChevron = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/* ─── Hero ──────────────────────────────────────────────────────────────────── */

function HeroSection() {
  const scrollToHow = () => {
    document.getElementById("comment-ca-marche")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="hc-hero">
      <p className="cn-eyebrow hc-hero__eyebrow">
        <span className="cn-eyebrow__dot" aria-hidden />
        CARD SCOUT · INTELLIGENCE CARTES NHL
      </p>

      <h1 className="hc-hero__title">
        Les pros scorent.<br />
        <span className="hc-hero__title-ice">Les autres espèrent.</span>
      </h1>

      <p className="hc-hero__sub">
        Pendant que les autres jouent à l&apos;instinct, Card Scout analyse
        13 facteurs en temps réel et te dit exactement quoi faire —
        Acheter, Surveiller ou Passer.{" "}
        <strong>Fini les mauvais achats.</strong>
      </p>

      <div className="hc-hero__ctas">
        <button
          type="button"
          className="cn-btn cn-btn--solid hc-hero__cta-primary"
          onClick={scrollToHow}
        >
          Comment ça marche
          <IconChevron className="hc-hero__cta-chev" />
        </button>
        <Link href="/a-propos" className="cn-btn cn-btn--ghost hc-hero__cta-secondary">
          À propos
          <IconArrow width={14} height={14} />
        </Link>
      </div>

      <p className="hc-hero__trust">
        100% gratuit · Aucune inscription · 900+ joueurs analysés
      </p>
    </section>
  );
}

/* ─── Aha Moment ─────────────────────────────────────────────────────────────── */

const AHA_DEALS = [
  { type: "Young Guns RC",  grade: "Raw",    price: "$38.00", score: 8.9, verdict: "ACHETER",    verdictKey: "profit", delta: "−22% vs cote" },
  { type: "O-Pee-Chee RC", grade: "PSA 9",  price: "$72.00", score: 7.5, verdict: "SURVEILLER", verdictKey: "warn",   delta: "±0% vs cote" },
  { type: "Canvas C87",    grade: "Raw",    price: "$14.50", score: 6.4, verdict: "SURVEILLER", verdictKey: "warn",   delta: "−8% vs cote" },
];

/* ─── Recent Players Strip ─────────────────────────────────────────────────── */

function RecentPlayersStrip() {
  const { recent } = useRecentPlayers();
  if (recent.length < 2) return null;

  return (
    <section className="hc-recent-section" aria-label="Joueurs récemment consultés">
      <div className="hc-recent__head">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" aria-hidden />
          TES DERNIÈRES VISITES
        </p>
      </div>
      <div className="hc-recent__strip" role="list">
        {recent.map((p) => (
          <Link
            key={p.id}
            href={`/player/${p.id}`}
            className="hc-recent-chip"
            role="listitem"
          >
            <div className="hc-recent-chip__avatar">
              {p.headshotUrl ? (
                <img src={p.headshotUrl} alt="" loading="lazy" />
              ) : (
                <span className="hc-recent-chip__ph" aria-hidden>◆</span>
              )}
            </div>
            <div className="hc-recent-chip__meta">
              <span className="hc-recent-chip__name">{p.name}</span>
              {p.team ? <span className="hc-recent-chip__team">{p.team}</span> : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─── Live Section (Ça bouge maintenant) ───────────────────────────────────── */

function formatTimeLeft(endIso, nowMs) {
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(endMs)) return null;
  const ms = endMs - nowMs;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h ${String(m).padStart(2, "0")}min`;
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}min ${String(s).padStart(2, "0")}s`;
}

function formatAgo(iso, nowMs) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const minutes = Math.max(1, Math.floor((nowMs - t) / 60000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function formatCad(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(x);
}

function LiveSection() {
  const [auction, setAuction] = useState(null);
  const [hottest, setHottest] = useState(null);
  const [mover, setMover] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch("/api/auctions/ending-soon").then((r) => r.json()),
      fetch("/api/deals/hottest").then((r) => r.json()),
      fetch("/api/movers").then((r) => r.json()),
    ]).then((results) => {
      if (cancelled) return;
      const [auctionRes, hottestRes, moverRes] = results;
      if (auctionRes.status === "fulfilled") {
        const list = auctionRes.value?.auctions ?? [];
        setAuction(list.length > 0 ? list[0] : null);
      }
      if (hottestRes.status === "fulfilled") {
        const cards = hottestRes.value?.cards ?? [];
        setHottest(cards.length > 0 ? cards[0] : null);
      }
      if (moverRes.status === "fulfilled") {
        setMover(moverRes.value?.mover ?? null);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const hasAuction = auction && Date.parse(auction.endAt) > nowMs;
  const hasHottest = !!hottest;
  const hasMover = !!mover;
  const shown = [hasAuction, hasHottest, hasMover].filter(Boolean).length;

  // Si rien à montrer ET pas en chargement : masque toute la section
  if (!loading && shown === 0) return null;

  return (
    <section className="hc-section hc-live-section" aria-label="Activité en temps réel">
      <Reveal>
        <p className="cn-eyebrow" style={{ marginBottom: "0.75rem" }}>
          <span className="cn-eyebrow__dot hc-live__pulse" aria-hidden />
          EN TEMPS RÉEL
        </p>
        <h2 className="cn-h2 hc-live__title">Ça bouge maintenant</h2>
        <p className="cn-body hc-live__sub">
          Le marché change chaque heure. Voici ce qui mérite ton attention en ce moment précis.
        </p>
      </Reveal>

      <div className="hc-live__grid">
        {loading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="hc-live-card hc-live-card--skel">
              <div className="hc-live-card__skel-line" />
              <div className="hc-live-card__skel-line hc-live-card__skel-line--lg" />
              <div className="hc-live-card__skel-line hc-live-card__skel-line--sm" />
            </div>
          ))
        ) : (
          <>
            {hasAuction && (
              <Reveal index={0}>
                <Link href="/encheres" className="hc-live-card hc-live-card--auction">
                  <div className="hc-live-card__head">
                    <span className="hc-live-card__pill">ENCHÈRE CHAUDE</span>
                    <span className="hc-live-card__timer">
                      {formatTimeLeft(auction.endAt, nowMs) ?? "—"}
                    </span>
                  </div>
                  <p className="hc-live-card__player">{auction.playerName}</p>
                  <p className="hc-live-card__cardType">{auction.cardType}</p>
                  <div className="hc-live-card__metric">
                    <span className="hc-live-card__metric-label">Bid actuel</span>
                    <span className="hc-live-card__metric-val">{formatCad(auction.priceCad)}</span>
                    <span className="hc-live-card__metric-delta">−{auction.dealPct}% vs cote</span>
                  </div>
                  <span className="hc-live-card__cta">Voir l&apos;enchère →</span>
                </Link>
              </Reveal>
            )}
            {hasHottest && (
              <Reveal index={1}>
                <Link href="/deals" className="hc-live-card hc-live-card--hottest">
                  <div className="hc-live-card__head">
                    <span className="hc-live-card__pill hc-live-card__pill--hot">HOTTEST DEAL</span>
                    <span className="hc-live-card__updated">refresh 6h</span>
                  </div>
                  <p className="hc-live-card__player">{hottest.playerName}</p>
                  <p className="hc-live-card__cardType">{hottest.groupType ?? "—"}</p>
                  <div className="hc-live-card__metric">
                    <span className="hc-live-card__metric-label">Score IA</span>
                    <span className="hc-live-card__metric-val">
                      {Number(hottest.investmentScore ?? 0).toFixed(1)}<span className="hc-live-card__metric-max">/10</span>
                    </span>
                    {hottest.percentOfMarket != null && (
                      <span className="hc-live-card__metric-delta">
                        {Math.round(hottest.percentOfMarket)}% du marché
                      </span>
                    )}
                  </div>
                  <span className="hc-live-card__cta">Voir le deal →</span>
                </Link>
              </Reveal>
            )}
            {hasMover && (
              <Reveal index={2}>
                <Link href={`/player/${mover.playerId}`} className="hc-live-card hc-live-card--mover">
                  <div className="hc-live-card__head">
                    <span className="hc-live-card__pill hc-live-card__pill--mover">TOP SCORE — RÉÉVALUÉ</span>
                    <span className="hc-live-card__updated">{formatAgo(mover.computedAt, nowMs) ?? "—"}</span>
                  </div>
                  <p className="hc-live-card__player">{mover.playerName}</p>
                  <p className="hc-live-card__cardType">{mover.team ?? "—"}</p>
                  <div className="hc-live-card__metric">
                    <span className="hc-live-card__metric-label">Score Card Scout</span>
                    <span className="hc-live-card__metric-val">
                      {Number(mover.score).toFixed(1)}<span className="hc-live-card__metric-max">/10</span>
                    </span>
                    {mover.tier && (
                      <span className="hc-live-card__metric-delta">Tier {mover.tier}</span>
                    )}
                  </div>
                  <span className="hc-live-card__cta">Voir le joueur →</span>
                </Link>
              </Reveal>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AhaMomentSection() {
  return (
    <section className="hc-section hc-aha-section" aria-label="Exemple de résultats Card Scout">
      <Reveal>
        <p className="cn-eyebrow" style={{ marginBottom: "0.75rem" }}>
          <span className="cn-eyebrow__dot" aria-hidden />
          VU EN ACTION
        </p>
        <h2 className="cn-h2 hc-aha__title">
          Recherche : <span className="hc-aha__player">Cole Caufield</span>
        </h2>
        <p className="cn-body hc-aha__sub">
          12 annonces eBay trouvées · 3 deals à regarder en priorité
        </p>
      </Reveal>

      <div className="hc-aha__deals">
        {AHA_DEALS.map((d, i) => (
          <Reveal key={d.type} index={i}>
            <div className={`hc-aha-deal hc-aha-deal--${d.verdictKey}`}>
              <div className="hc-aha-deal__head">
                <span className={`cn-badge cn-badge--${d.verdictKey}`}>
                  <span className="cn-badge__dot" aria-hidden />
                  {d.verdict}
                </span>
                <span className="hc-aha-deal__score">
                  {d.score}<span className="hc-aha-deal__score-max">/10</span>
                </span>
              </div>
              <p className="hc-aha-deal__type">{d.type}</p>
              <p className="hc-aha-deal__grade">{d.grade}</p>
              <div className="hc-aha-deal__footer">
                <span className="hc-aha-deal__price">{d.price}</span>
                <span className={`hc-aha-deal__delta hc-aha-deal__delta--${d.verdictKey}`}>{d.delta}</span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal>
        <div className="hc-aha__cta">
          <Link href="/deals?player=Cole+Caufield" className="cn-btn cn-btn--ghost" style={{ fontSize: "0.88rem" }}>
            Voir tous les deals Caufield
            <IconArrow width={14} height={14} />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

/* ─── Feature Grid ──────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
        <path d="M11 8v6M8 11h6"/>
      </svg>
    ),
    tag: "DEAL FINDER",
    title: "Trouve les cartes sous-évaluées",
    body: "Cherche n'importe quel joueur NHL. L'IA scanne eBay Canada en temps réel, groupe les cartes par type (YG, Auto, Gradée…) et attribue un score d'investissement 0–10 à chaque annonce.",
    href: "/deals",
    cta: "Explorer les deals",
    accent: "ice",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/>
        <path d="M9 21H5a2 2 0 0 1-2-2v-4"/><path d="M15 21h4a2 2 0 0 0 2-2v-4"/>
      </svg>
    ),
    tag: "COMPARE MODE",
    title: "Compare 2 joueurs côte à côte",
    body: "Après avoir cherché un joueur, clique sur \"Comparer\" et tape un second joueur. Les deals des deux s'affichent en colonnes — idéal pour arbitrer entre deux achats.",
    href: "/deals",
    cta: "Comparer des joueurs",
    accent: "gold",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V9z"/>
        <path d="M10 3v6h9"/><path d="M8 15h8M8 11h4"/>
      </svg>
    ),
    tag: "ANALYSER",
    title: "Colle une URL eBay, reçois un verdict",
    body: "Tu vois une carte intéressante sur eBay ? Colle le lien. Card Scout identifie le joueur, calcule la cote réelle, trouve des alternatives moins chères et donne un verdict d'investissement complet.",
    href: "/analyse",
    cta: "Analyser une annonce",
    accent: "ice",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17a9 9 0 0 1 18 0"/><path d="M12 17l4-5"/>
        <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
      </svg>
    ),
    tag: "SCORE IA",
    title: "Card Scout Score — 13 facteurs, 0 à 10",
    body: "Performance (14%), Momentum (10%), Accélération (8%), Âge (10%), Marché (10%), Upside (14%), Hype (14%), Risque (5%), Catalyseurs (6%), Discrépance (5%), + Équipe & Buzz. L'IA Card Scout ajuste le score final selon le contexte qualitatif du joueur.",
    href: "/opportunites",
    cta: "Voir les opportunités",
    accent: "gold",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
    ),
    tag: "MON VAULT",
    title: "Suis ton portfolio de cartes",
    body: "Ajoute tes cartes achetées (joueur, type, grade, prix). Card Scout calcule la valeur estimée actuelle via les prix eBay, le P&L en temps réel, et le Coach IA te donne 3 recommandations personnalisées.",
    href: "/portfolio",
    cta: "Ouvrir mon vault",
    accent: "green",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
    tag: "WATCHLIST",
    title: "Surveille tes joueurs préférés",
    body: "Mets en watchlist les joueurs qui t'intéressent. Reçois une alerte quand un deal intéressant apparaît pour eux sur eBay. Ne rate plus jamais une opportunité.",
    href: "/watchlist",
    cta: "Ma watchlist",
    accent: "ice",
  },
];

const ACCENT_COLORS = {
  ice:   { border: "rgba(0,212,255,0.25)",  bg: "rgba(0,212,255,0.07)",  text: "#00d4ff" },
  gold:  { border: "rgba(255,182,30,0.25)", bg: "rgba(255,182,30,0.07)", text: "#ffb61e" },
  green: { border: "rgba(16,185,129,0.25)", bg: "rgba(16,185,129,0.07)", text: "#10b981" },
};

function FeaturesSection() {
  return (
    <section className="hc-section hc-features-section" aria-labelledby="hc-features-title">
      <Reveal>
        <p className="cn-eyebrow" style={{ marginBottom: "1rem" }}>
          <span className="cn-eyebrow__dot" aria-hidden />
          FONCTIONNALITÉS
        </p>
        <h2 id="hc-features-title" className="cn-h2">
          TOUT CE QUE<br />CARD SCOUT FAIT.
        </h2>
        <p className="cn-body" style={{ marginTop: "1rem", maxWidth: "54ch" }}>
          De la recherche de deals à la gestion de ton portfolio — un seul outil, six fonctionnalités, zéro abonnement.
        </p>
      </Reveal>

      <div className="hc-features-grid">
        {FEATURES.map((f, i) => {
          const ac = ACCENT_COLORS[f.accent] ?? ACCENT_COLORS.ice;
          return (
            <Reveal key={f.tag} index={i}>
              <TiltCard maxTilt={3}>
                <div className="hc-feat" style={{ "--feat-border": ac.border, "--feat-bg": ac.bg, "--feat-text": ac.text }}>
                  <div className="hc-feat__icon-wrap">
                    {f.icon}
                  </div>
                  <span className="hc-feat__tag">{f.tag}</span>
                  <h3 className="hc-feat__title">{f.title}</h3>
                  <p className="hc-feat__body">{f.body}</p>
                  <Link href={f.href} className="hc-feat__link">
                    {f.cta}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </Link>
                </div>
              </TiltCard>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/* ─── How it works ──────────────────────────────────────────────────────────── */

const STEPS = [
  { num: "01", icon: <IconAnalyze />, title: "Analyse", body: "L'IA scanne les stats NHL en temps réel — performance, trajectoire, âge, momentum, marché. 15+ variables croisées par joueur." },
  { num: "02", icon: <IconScore />, title: "Score", body: "Un Card Scout Score 0-10 généré en moins de 3 secondes. Chaque facteur pèse selon son impact réel sur la valeur des cartes." },
  { num: "03", icon: <IconTarget />, title: "Opportunité", body: "Un verdict actionnable — Acheter, Surveiller, Éviter — avec les listings eBay live correspondants et leur cote face au marché." },
];

function HowItWorksSection() {
  return (
    <section id="comment-ca-marche" className="hc-section" aria-labelledby="hc-how-title">
      <div className="hc-how">
        <Reveal className="hc-how__title-wrap">
          <p className="cn-eyebrow" style={{ marginBottom: "1.25rem" }}>
            <span className="cn-eyebrow__dot" aria-hidden />
            COMMENT ÇA MARCHE
          </p>
          <h2 id="hc-how-title" className="cn-h2">
            DE LA STATS<br />AU VERDICT.<br />EN&nbsp;3&nbsp;ÉTAPES.
          </h2>
          <p className="cn-body" style={{ marginTop: "1.5rem", maxWidth: "32ch" }}>
            Chaque carte hockey vendue sur eBay est un signal. Card Scout les transforme en décisions.
          </p>
        </Reveal>

        <div className="hc-how__steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.num} index={i}>
              <TiltCard maxTilt={3}>
                <div className="cn-card hc-step">
                  <div className="hc-step__head">
                    <span className="hc-step__icon">{s.icon}</span>
                    <div>
                      <span className="hc-step__num">ÉTAPE {s.num}</span>
                      <h3 className="hc-step__title">{s.title}</h3>
                    </div>
                  </div>
                  <p className="hc-step__body">{s.body}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Vault Section ─────────────────────────────────────────────────────────── */

function VaultMock() {
  const cards = [
    { name: "Cole Caufield", team: "MTL", type: "Young Guns RC", grade: "PSA 10", buy: 120, est: 198, delta: +65 },
    { name: "Connor Bedard", team: "CHI", type: "O-Pee-Chee RC",  grade: "Raw",    buy: 45,  est: 72,  delta: +60 },
    { name: "Matvei Michkov", team: "PHI", type: "Canvas C",      grade: "BGS 9.5",buy: 88,  est: 94,  delta: +7  },
  ];
  return (
    <div className="hc-vault-mock" aria-label="Aperçu Mon Vault" role="img">
      <div className="hc-score-mock__chrome">
        <span className="hc-score-mock__dot hc-score-mock__dot--red" aria-hidden />
        <span className="hc-score-mock__dot hc-score-mock__dot--yellow" aria-hidden />
        <span className="hc-score-mock__dot hc-score-mock__dot--green" aria-hidden />
        <span className="hc-score-mock__url">cardscout.app/portfolio</span>
      </div>
      <div className="hc-vault-mock__header">
        <div>
          <p className="hc-vault-mock__header-label">VALEUR TOTALE ESTIMÉE</p>
          <p className="hc-vault-mock__header-val">364 <span>$CA</span></p>
        </div>
        <div className="hc-vault-mock__gain">
          <p className="hc-vault-mock__gain-label">GAIN TOTAL</p>
          <p className="hc-vault-mock__gain-val">+111 $ <span>(+44%)</span></p>
        </div>
      </div>
      <div className="hc-vault-mock__cards">
        {cards.map((c) => (
          <div key={c.name} className="hc-vault-mock__card">
            <div className="hc-vault-mock__card-info">
              <p className="hc-vault-mock__card-name">{c.name}</p>
              <p className="hc-vault-mock__card-meta">{c.type} · {c.grade}</p>
            </div>
            <div className="hc-vault-mock__card-prices">
              <span className="hc-vault-mock__buy">{c.buy}$</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" aria-hidden><path d="M5 12h14"/></svg>
              <span className="hc-vault-mock__est">{c.est}$</span>
              <span className="hc-vault-mock__delta" style={{ color: c.delta > 20 ? "var(--profit)" : c.delta > 0 ? "var(--gold)" : "var(--loss)" }}>
                {c.delta > 0 ? "+" : ""}{c.delta}%
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="hc-vault-mock__coach">
        <span className="hc-vault-mock__coach-label">COACH IA</span>
        <p className="hc-vault-mock__coach-text">Caufield en momentum haussier — bon moment pour renforcer.</p>
      </div>
    </div>
  );
}

function VaultSection() {
  return (
    <section className="hc-section" id="vault" aria-labelledby="hc-vault-title">
      <div className="hc-two-col hc-two-col--vault">
        <Reveal className="hc-two-col__visual hc-two-col__visual--left">
          <TiltCard maxTilt={4}>
            <VaultMock />
          </TiltCard>
        </Reveal>
        <Reveal index={1} className="hc-two-col__copy">
          <p className="cn-eyebrow" style={{ marginBottom: "1.25rem" }}>
            <span className="cn-eyebrow__dot" aria-hidden />
            MON VAULT — PORTFOLIO
          </p>
          <h2 id="hc-vault-title" className="cn-h2">
            SUIS TES CARTES<br />COMME UN PRO.
          </h2>
          <p className="cn-body" style={{ margin: "1.5rem 0 1.5rem" }}>
            Ajoute chaque carte achetée — joueur, type, grade, prix d&apos;achat. Card Scout calcule
            la valeur estimée via les prix eBay en direct et affiche ton P&amp;L en temps réel.
          </p>
          <div className="hc-vault-features">
            {[
              { label: "Valeur estimée", desc: "basée sur les vrais prix eBay actuels, par type et grade" },
              { label: "P&L en temps réel", desc: "gain ou perte vs ton prix d'achat, avec flèche directionnelle" },
              { label: "Sell Signals", desc: "badge \"BON MOMENT\" quand une carte dépasse +25% de gain" },
              { label: "Coach IA", desc: "3 recommandations personnalisées : garder, vendre, acheter" },
            ].map((item) => (
              <div key={item.label} className="hc-vault-feat">
                <div className="hc-vault-feat__dot" aria-hidden />
                <div>
                  <strong className="hc-vault-feat__label">{item.label}</strong>
                  <span className="hc-vault-feat__desc"> — {item.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "2rem" }}>
            <Link href="/portfolio" className="cn-btn cn-btn--solid hc-btn--green">
              OUVRIR MON VAULT
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Score Section ─────────────────────────────────────────────────────────── */

const SCORE_FACTORS = [
  { label: "Performance",  pct: 88, color: "var(--ice)",    weight: "20%" },
  { label: "Momentum",     pct: 93, color: "var(--profit)", weight: "20%" },
  { label: "Âge & Upside", pct: 75, color: "var(--gold)",   weight: "15%" },
  { label: "Marché eBay",  pct: 82, color: "var(--ice)",    weight: "15%" },
  { label: "Liquidité",    pct: 68, color: "var(--silver)", weight: "10%" },
  { label: "Hype",         pct: 79, color: "var(--gold)",   weight: "10%" },
  { label: "Upside",       pct: 85, color: "var(--profit)", weight: "10%" },
];

function ScoreMock() {
  return (
    <div className="hc-score-mock" aria-label="Démonstration Card Scout Score" role="img">
      {/* terminal chrome */}
      <div className="hc-score-mock__chrome">
        <span className="hc-score-mock__dot hc-score-mock__dot--red" aria-hidden />
        <span className="hc-score-mock__dot hc-score-mock__dot--yellow" aria-hidden />
        <span className="hc-score-mock__dot hc-score-mock__dot--green" aria-hidden />
        <span className="hc-score-mock__url">cardscout.app/player/caufield</span>
      </div>

      {/* player header */}
      <div className="hc-score-mock__player">
        <img
          src="https://assets.nhle.com/mugs/nhl/20242025/MTL/8481540.png"
          alt="" width={56} height={70}
          className="hc-score-mock__avatar"
          loading="lazy"
        />
        <div>
          <p className="hc-score-mock__name">Cole Caufield</p>
          <p className="hc-score-mock__meta">
            <span className="hc-score-mock__team">MTL</span>
            {" · RW · #22"}
          </p>
        </div>
        <div className="hc-score-mock__score-chip">
          <span className="hc-score-mock__score-num">8.2</span>
          <span className="hc-score-mock__score-max">/10</span>
        </div>
      </div>

      {/* factor bars */}
      <div className="hc-score-mock__factors">
        {SCORE_FACTORS.map((f, i) => (
          <div key={f.label} className="hc-score-mock__factor" style={{ "--factor-delay": `${i * 120}ms` }}>
            <div className="hc-score-mock__factor-head">
              <span className="hc-score-mock__factor-label">{f.label}</span>
              <span className="hc-score-mock__factor-weight">{f.weight}</span>
              <span className="hc-score-mock__factor-val" style={{ color: f.color }}>
                {(f.pct / 10).toFixed(1)}
              </span>
            </div>
            <div className="hc-score-mock__factor-track">
              <div
                className="hc-score-mock__factor-fill"
                style={{ "--fill-pct": `${f.pct}%`, "--fill-color": f.color }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* verdict */}
      <div className="hc-score-mock__verdict">
        <span className="cn-badge cn-badge--profit">
          <span className="cn-badge__dot" aria-hidden />
          ACHETER
        </span>
        <span className="hc-score-mock__verdict-text">
          Potentiel haussier confirmé — momentum + âge + marché alignés.
        </span>
      </div>
    </div>
  );
}

const SCORE_BULLETS = [
  { icon: null, strong: "Score généré en temps réel", rest: "par l'IA Card Scout." },
  { icon: null, strong: "13 facteurs analysés", rest: "— performance, momentum, accélération, âge, marché, upside, hype, risque, catalyseurs, discrépance et plus." },
  { icon: null, strong: "Verdict actionnable", rest: "— Acheter, Surveiller ou Passer. Pas de jargon." },
  { icon: null, strong: "Calibré sur eBay CA live", rest: "— prix réels, pas des estimations figées." },
];

function ScoreSection() {
  return (
    <section className="hc-section" id="score" aria-labelledby="hc-score-title">
      <div className="hc-two-col hc-two-col--score">
        {/* copy side */}
        <Reveal className="hc-two-col__copy">
          <p className="cn-eyebrow" style={{ marginBottom: "1.25rem" }}>
            <span className="cn-eyebrow__dot" aria-hidden />
            LE CARD SCOUT SCORE
          </p>
          <h2 id="hc-score-title" className="cn-h2">
            13 FACTEURS.<br />1 SCORE.<br />0 DEVINETTE.
          </h2>
          <p className="cn-body" style={{ margin: "1.5rem 0 2rem" }}>
            Performance, momentum, accélération, âge, marché, upside,
            hype, risque, catalyseurs, discrépance de marché et plus —
            chaque facteur alimente le score IA en temps réel.
            Le résultat : un score 0–10 clair, avec le raisonnement derrière.
          </p>
          <ul className="hc-bullets">
            {SCORE_BULLETS.map((b) => (
              <li key={b.strong} className="hc-bullet">
                <span className="hc-bullet__dot" aria-hidden />
                <span className="hc-bullet__text">
                  <strong>{b.strong}</strong> {b.rest}
                </span>
              </li>
            ))}
          </ul>
          <blockquote className="hc-quote">
            Comme avoir un analyste de marché qui ne dort jamais.
          </blockquote>
          <div style={{ marginTop: "2rem" }}>
            <Link href="/opportunites" className="cn-btn cn-btn--solid">
              VOIR LES OPPORTUNITÉS
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        </Reveal>

        {/* circuit side */}
        <Reveal index={1} className="hc-two-col__visual">
          <ScoreCircuit />
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Analyse Section ───────────────────────────────────────────────────────── */

const ANALYSE_STEPS = [
  {
    num: "01",
    label: "COLLER L'URL",
    title: "N'importe quelle annonce eBay",
    body: "Copie-colle le lien d'une carte qui t'intéresse — peu importe le joueur, la saison ou le format. eBay.ca, eBay.com, eBay.co.uk.",
  },
  {
    num: "02",
    label: "L'IA ANALYSE",
    title: "Joueur, carte, prix du marché",
    body: "Card Scout identifie automatiquement le joueur, le type de carte (Rookie, Auto, Gradée…), calcule le Card Scout Score du joueur et compare le prix à la cote actuelle du marché.",
  },
  {
    num: "03",
    label: "VERDICT",
    title: "Acheter, Surveiller ou Passer",
    body: "Un rapport complet : verdict d'investissement, projection de prix sur 5 ans, et toutes les alternatives moins chères trouvées sur eBay au même moment.",
  },
];

function AnalyseMock() {
  return (
    <div className="hc-analyse-mock" aria-label="Démonstration de l'analyse d'annonce" role="img">
      <div className="hc-score-mock__chrome">
        <span className="hc-score-mock__dot hc-score-mock__dot--red" aria-hidden />
        <span className="hc-score-mock__dot hc-score-mock__dot--yellow" aria-hidden />
        <span className="hc-score-mock__dot hc-score-mock__dot--green" aria-hidden />
        <span className="hc-score-mock__url">cardscout.app/analyse</span>
      </div>

      {/* URL input */}
      <div className="hc-analyse-mock__input-row">
        <span className="hc-analyse-mock__prompt">›</span>
        <span className="hc-analyse-mock__url-text">
          ebay.ca/itm/<span className="hc-analyse-mock__url-id">386741209388</span>
        </span>
        <span className="hc-analyse-mock__cursor" aria-hidden />
      </div>

      {/* verdict card */}
      <div className="hc-analyse-mock__verdict">
        <span className="cn-badge cn-badge--profit">
          <span className="cn-badge__dot" aria-hidden />
          ACHETER
        </span>
        <p className="hc-analyse-mock__summary">
          Annonce 18% sous la cote du marché. Joueur en momentum haussier, carte liquide.
        </p>
      </div>

      {/* data grid */}
      <div className="hc-analyse-mock__grid">
        <div className="hc-analyse-mock__cell">
          <span className="hc-analyse-mock__cell-label">PRIX ANNONCE</span>
          <span className="hc-analyse-mock__cell-val">$45.00</span>
        </div>
        <div className="hc-analyse-mock__cell">
          <span className="hc-analyse-mock__cell-label">COTE MARCHÉ</span>
          <span className="hc-analyse-mock__cell-val hc-analyse-mock__cell-val--ice">$54.80</span>
        </div>
        <div className="hc-analyse-mock__cell">
          <span className="hc-analyse-mock__cell-label">SCORE JOUEUR</span>
          <span className="hc-analyse-mock__cell-val hc-analyse-mock__cell-val--gold">8.2/10</span>
        </div>
        <div className="hc-analyse-mock__cell">
          <span className="hc-analyse-mock__cell-label">PROJECTION 5 ANS</span>
          <span className="hc-analyse-mock__cell-val hc-analyse-mock__cell-val--profit">+68%</span>
        </div>
      </div>

      {/* alternatives */}
      <div className="hc-analyse-mock__alts">
        <span className="hc-analyse-mock__alts-label">3 ALTERNATIVES MOINS CHÈRES TROUVÉES</span>
        <div className="hc-analyse-mock__alts-row">
          {["$38.00", "$41.50", "$43.00"].map((p) => (
            <span key={p} className="hc-analyse-mock__alt-chip">{p}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalyseSection() {
  return (
    <section className="hc-section" id="analyse" aria-labelledby="hc-analyse-title">
      <div className="hc-two-col hc-two-col--analyse">
        {/* visual side — left on desktop */}
        <Reveal className="hc-two-col__visual hc-two-col__visual--left">
          <TiltCard maxTilt={4}>
            <AnalyseMock />
          </TiltCard>
        </Reveal>

        {/* copy side */}
        <Reveal index={1} className="hc-two-col__copy">
          <p className="cn-eyebrow" style={{ marginBottom: "1.25rem" }}>
            <span className="cn-eyebrow__dot" aria-hidden />
            ANALYSER UNE ANNONCE EBAY
          </p>
          <h2 id="hc-analyse-title" className="cn-h2">
            UNE URL.<br />UN VERDICT<br />COMPLET.
          </h2>
          <p className="cn-body" style={{ margin: "1.5rem 0 2rem" }}>
            Tu vois une carte sur eBay et tu te demandes si c&apos;est un bon
            prix ? Colle le lien. L&apos;IA s&apos;occupe du reste — joueur,
            type de carte, cote réelle, alternatives moins chères, projection
            de valeur.
          </p>

          <div className="hc-analyse-steps">
            {ANALYSE_STEPS.map((s, i) => (
              <div key={s.num} className="hc-analyse-step">
                <div className="hc-analyse-step__num">{s.num}</div>
                <div className="hc-analyse-step__content">
                  <span className="cn-label" style={{ color: "var(--ice)", display: "block", marginBottom: "0.3rem" }}>{s.label}</span>
                  <h4 className="hc-analyse-step__title">{s.title}</h4>
                  <p className="hc-analyse-step__body">{s.body}</p>
                </div>
                {i < ANALYSE_STEPS.length - 1 && <div className="hc-analyse-step__line" aria-hidden />}
              </div>
            ))}
          </div>

          <div style={{ marginTop: "2.5rem" }}>
            <Link href="/analyse" className="cn-btn cn-btn--solid">
              ANALYSER UNE ANNONCE
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}


/* ─── Transparence Section ──────────────────────────────────────────────────── */

const TRANSPARENCY_ITEMS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    ),
    label: "Bêta ouverte",
    text: "Card Scout est en développement actif. L'IA aide à filtrer le bruit du marché, mais la décision finale reste toujours la tienne. Aucune garantie de gain — juste un meilleur point de départ.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
    label: "Source des prix",
    text: "Les prix affichés viennent des annonces eBay actives (prix demandés), pas des ventes conclues. C'est une indication utile mais pas une cote définitive. L'intégration des sold comps (ventes réelles) est en cours.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
        <circle cx="12" cy="15" r="2" />
      </svg>
    ),
    label: "Moteur IA",
    text: "Le Card Scout Score et les verdicts d'investissement sont générés par l'IA Card Scout. Le modèle analyse 13 facteurs : stats NHL, momentum, accélération, âge, marché, upside, hype, risque, catalyseurs et plus — mais reste un outil, pas un conseiller financier.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M4 21v-2a4 4 0 0 1 3-3.87" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    label: "100% gratuit, sans compte",
    text: "Pas d'inscription obligatoire, pas de paywall, pas de données personnelles collectées. Le code est open-source. Si le produit t'aide, partage-le — c'est la meilleure façon de contribuer.",
  },
];

function TransparenceSection() {
  return (
    <section className="hc-section hc-transparence-section" aria-labelledby="hc-transparence-title">
      <Reveal>
        <p className="cn-eyebrow" style={{ marginBottom: "1rem" }}>
          <span className="cn-eyebrow__dot" aria-hidden />
          TRANSPARENCE
        </p>
        <h2 id="hc-transparence-title" className="cn-h2">
          CE QUE CARD SCOUT<br />EST — ET N&apos;EST PAS.
        </h2>
        <p className="cn-body" style={{ marginTop: "1rem", maxWidth: "54ch" }}>
          Pas de promesses vides. Voici exactement comment l&apos;outil fonctionne, ses limites, et pourquoi il peut quand même t&apos;aider.
        </p>
      </Reveal>

      <div className="hc-transparence-grid">
        {TRANSPARENCY_ITEMS.map((item, i) => (
          <Reveal key={item.label} index={i}>
            <div className="hc-transparence-card">
              <div className="hc-transparence-card__icon">{item.icon}</div>
              <div>
                <h3 className="hc-transparence-card__label">{item.label}</h3>
                <p className="hc-transparence-card__text">{item.text}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────────── */

export default function HomeCinematic() {
  return (
    <main className="hc-page cinematic">
      <WelcomeTour />
      <ScrollProgress />
      <Atmosphere />

      <div className="hc-nav">
        <div className="hc-nav__inner">
          <AppNav active="home" />
        </div>
      </div>

      <HeroSection />
      <LiveSection />
      <HowItWorksSection />
      <ScoreSection />
      <AnalyseSection />
      <VaultSection />
      <FeaturesSection />
      <TransparenceSection />
    </main>
  );
}
