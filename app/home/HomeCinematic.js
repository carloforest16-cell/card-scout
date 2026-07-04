/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import "./home-wow.css";

import { createClient as createSupabaseClient } from "@/lib/supabase/client";

import AppNav from "../AppNav";
import HomeFeatureTabs from "./HomeFeatureTabs";
import ScrollStory from "./ScrollStory";
import { BrandMarquee, HeroFloatingCards, MouseSpotlight } from "./WowFx";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";
import WelcomeTour from "../components/WelcomeTour";
import "../components/welcome-tour.css";
import SharedCountUp from "../components/CountUp";
import SplitWords from "../components/wow/SplitWords";

/* ─── Icons ─────────────────────────────────────────────────────────────────── */

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

/* ─── Hero — animations kinétiques ──────────────────────────────────────────── */

const HW_EASE = [0.22, 1, 0.36, 1];

// SplitWords et CountUp extraits en primitives partagées (tâche 4.1 du plan) :
// app/components/wow/SplitWords.js et app/components/CountUp.js (déjà
// existant, réutilisé tel quel plutôt que dupliqué — voir note de tâche 4.1).

function HeroSection() {
  const [isAuthed, setIsAuthed] = useState(false);
  const reduced = useReducedMotion();
  const sectionRef = useRef(null);

  // Parallaxe de sortie : le contenu du hero glisse et s'estompe au scroll
  const { scrollY } = useScroll();
  const contentY = useTransform(scrollY, [0, 640], [0, 130]);
  const contentOpacity = useTransform(scrollY, [0, 520], [1, 0]);

  useEffect(() => {
    const supabase = createSupabaseClient();
    supabase.auth.getUser().then(({ data }) => setIsAuthed(Boolean(data?.user)));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthed(Boolean(session?.user));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const scrollToHow = () => {
    document.getElementById("comment-ca-marche")?.scrollIntoView({ behavior: "smooth" });
  };

  const dashboardHref = isAuthed ? "/dashboard" : "/auth/login";

  return (
    <section ref={sectionRef} className="hc-hero" style={{ position: "relative", overflow: "hidden" }}>
      {/* Halo conique lent derrière le titre */}
      <div className="hw-hero__halo" aria-hidden />
      {/* Cartes deals flottantes avec parallaxe souris (desktop) */}
      <HeroFloatingCards />
      {/* Logo sombre en arrière-plan avec blend mode screen */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.jpg"
        alt=""
        aria-hidden
        className="hw-hero__logo"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -55%)",
          width: "min(600px, 90vw)",
          opacity: 0.18,
          mixBlendMode: "screen",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />

      <motion.div
        style={reduced ? undefined : { y: contentY, opacity: contentOpacity }}
      >
        <motion.p
          className="cn-eyebrow hc-hero__eyebrow hw-eyebrow"
          style={{ position: "relative", zIndex: 1, justifyContent: "center" }}
          initial={reduced ? false : { opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: HW_EASE }}
        >
          <span className="cn-eyebrow__dot" aria-hidden />
          CARD METRICS · INTELLIGENCE CARTES NHL
        </motion.p>

        <h1 className="hc-hero__title hw-title">
          <span className="hw-title__line">
            <SplitWords text="Les pros scorent." delay={0.25} />
          </span>
          <span className="hw-title__line hw-title__line--ice">
            <SplitWords text="Les autres espèrent." delay={0.6} />
          </span>
        </h1>

        <motion.p
          className="hc-hero__sub hw-sub"
          initial={reduced ? false : { opacity: 0, y: 26, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, delay: 1.05, ease: HW_EASE }}
        >
          Pendant que les autres jouent à l&apos;instinct, Card Metrics analyse
          13 facteurs en temps réel et te dit exactement quoi faire —
          Acheter, Chercher mieux ou Passer.{" "}
          <strong>Fini les mauvais achats.</strong>
        </motion.p>

        <motion.div
          className="hc-hero__ctas hw-ctas"
          initial={reduced ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.35, ease: HW_EASE }}
        >
          <button
            type="button"
            className="cn-btn cn-btn--solid hc-hero__cta-primary hw-btn-shine"
            onClick={scrollToHow}
          >
            Comment ça marche
            <IconChevron className="hc-hero__cta-chev" />
          </button>
          <Link href={dashboardHref} className="cn-btn cn-btn--ghost hc-hero__cta-secondary hw-btn-shine">
            Dashboard
            <IconArrow width={14} height={14} />
          </Link>
        </motion.div>

        <motion.p
          className="hc-hero__trust hw-trust"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 1.6, ease: HW_EASE }}
        >
          <span>100% gratuit</span>
          <span className="hw-trust__dot" aria-hidden />
          <span>Aucune inscription</span>
          <span className="hw-trust__dot" aria-hidden />
          <span><SharedCountUp value={900} suffix="+" duration={1400} className="hw-trust__num" /> joueurs analysés</span>
        </motion.p>
      </motion.div>

      <motion.button
        type="button"
        className="hw-cue"
        onClick={scrollToHow}
        aria-label="Défiler vers le contenu"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 2.2 }}
      >
        <IconChevron className="hw-cue__chev" />
      </motion.button>
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

// `at` peut être un ISO string OU un timestamp epoch ms (ex. fetchedAt de
// /api/deals/hottest) — Date.parse() ignore silencieusement les nombres.
function parseAnyTimestamp(at) {
  if (typeof at === "number") return Number.isFinite(at) ? at : NaN;
  return Date.parse(at);
}

function formatAgo(at, nowMs) {
  const t = parseAnyTimestamp(at);
  if (!Number.isFinite(t)) return null;
  const minutes = Math.max(1, Math.floor((nowMs - t) / 60000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

// Même seuil que RefreshBar.js (tâche 2.5) — garde-fou fraîcheur repris ici
// pour la carte Hottest Deal réintégrée en tâche 5.4.
const HC_LIVE_STALE_AFTER_MS = 72 * 60 * 60 * 1000;
function isStaleAgo(at, nowMs) {
  const t = parseAnyTimestamp(at);
  return Number.isFinite(t) && nowMs - t > HC_LIVE_STALE_AFTER_MS;
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
        setHottest(cards.length > 0 ? { ...cards[0], fetchedAt: hottestRes.value?.fetchedAt ?? null } : null);
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
                    <span className={`hc-live-card__updated${isStaleAgo(hottest.fetchedAt, nowMs) ? " hc-live-card__updated--stale" : ""}`}>
                      {formatAgo(hottest.fetchedAt, nowMs) ?? "—"}
                    </span>
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
                    <span className="hc-live-card__metric-label">Score Card Metrics</span>
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
    text: "Card Metrics est en développement actif. L'IA aide à filtrer le bruit du marché, mais la décision finale reste toujours la tienne. Aucune garantie de gain — juste un meilleur point de départ.",
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
    text: "Le Card Metrics Score et les verdicts d'investissement sont générés par l'IA Card Metrics. Le modèle analyse 13 facteurs : stats NHL, momentum, accélération, âge, marché, upside, hype, risque, catalyseurs et plus — mais reste un outil, pas un conseiller financier.",
    linkHref: "/backtest",
    linkLabel: "Le score est-il fiable ? Voir le backtest",
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
          CE QUE CARD METRICS<br />EST — ET N&apos;EST PAS.
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
                {item.linkHref && (
                  <Link href={item.linkHref} className="hc-transparence-card__link">
                    {item.linkLabel}
                    <span aria-hidden> →</span>
                  </Link>
                )}
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
      <ScrollStory />
      <LiveSection />
      <BrandMarquee />
      <HomeFeatureTabs />
      <TransparenceSection />
      <MouseSpotlight />
    </main>
  );
}
