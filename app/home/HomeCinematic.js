/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AppNav from "../AppNav";
import AnimatedTitle from "../components/AnimatedTitle";
import Atmosphere from "../components/Atmosphere";
import CountUp from "../components/CountUp";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";
import TiltCard from "../components/TiltCard";
import HomePremium3DShowcase from "./HomePremium3DShowcase";

function formatCad(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(x);
}

function fmtScore(n) {
  const x = Number(n);
  return Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : "—";
}

function verdictBadgeClass(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "cn-badge--profit";
  if (v.includes("passer") || v.includes("éviter") || v.includes("eviter")) return "cn-badge--loss";
  return "cn-badge--gold";
}

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

function HeroSection({ carouselPlayers, carouselLoading }) {
  return (
    <section className="hc-hero" aria-busy={carouselLoading || undefined}>
      <p className="cn-eyebrow hc-hero__eyebrow">
        <span className="cn-eyebrow__dot" aria-hidden />
        INTELLIGENCE D&apos;INVESTISSEMENT · CARTES NHL
      </p>

      <AnimatedTitle text="Card" iceWord="Scout" />

      <p className="hc-hero__sub">
        L&apos;IA scanne les stats NHL et le marché eBay pour repérer les cartes
        sous-évaluées avant que tout le monde réagisse. Pas de devinettes — juste de la data.
      </p>

      <div className="hc-hero__cta">
        <Link href="/deals" className="hc-hero__btn">
          Explorer les deals
          <IconArrow className="hc-hero__btn__arrow" />
        </Link>
      </div>

      {/* 3D coverflow carousel */}
      {(carouselLoading || carouselPlayers.length > 0) && (
        <p className="cn-eyebrow hc-hero__carousel-label">
          <span className="cn-eyebrow__dot" aria-hidden />
          TOP OPPORTUNITÉS · CLASSÉES PAR NOTRE AI SCORE
        </p>
      )}
      {carouselLoading && (
        <div className="hc-hero__carousel" aria-hidden>
          <div className="hc-skel hc-skel--carousel" />
        </div>
      )}
      {!carouselLoading && carouselPlayers.length > 0 && (
        <>
          <div className="hc-hero__carousel">
            <HomePremium3DShowcase players={carouselPlayers} />
          </div>
          <div className="hc-hero__carousel-cta">
            <Link href="/opportunites" className="hc-hero__btn hc-hero__btn--gold">
              Voir les {carouselPlayers.length} meilleures opportunités
              <IconArrow className="hc-hero__btn__arrow" />
            </Link>
          </div>
        </>
      )}

      <div className="hc-scroll-cue" aria-hidden>
        <span>Scroll</span>
        <IconChevron className="hc-scroll-cue__chev" />
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
    <section className="hc-section" aria-labelledby="hc-how-title">
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

/* ─── Hottest Deals (client fetch) ─────────────────────────────────────────── */

function TopDealsSection() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deals/hottest")
      .then((r) => r.json())
      .then((d) => {
        setDeals((d.cards ?? []).slice(0, 3));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <section className="hc-section" aria-labelledby="hc-deals-title">
      <Reveal>
        <p className="cn-eyebrow" style={{ marginBottom: "1rem" }}>
          <span className="cn-eyebrow__dot" aria-hidden />
          OPPORTUNITÉS LIVE · EBAY
        </p>
        <h2 id="hc-deals-title" className="cn-h2">
          LES MEILLEURS DEALS<br />DU MOMENT
        </h2>
        <p className="cn-body" style={{ marginTop: "1rem", maxWidth: "52ch" }}>
          Scannés en temps réel sur eBay Canada. Scorés par l&apos;IA.
        </p>
      </Reveal>

      <div className="hc-deals">
        {loading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="hc-deal-skel" />
          ))
        ) : deals.length > 0 ? (
          deals.map((d, i) => {
            const score = Number(d.score ?? d.investmentScore);
            const high = score >= 7;
            return (
              <Reveal key={`${d.listingId ?? i}`} index={i}>
                <TiltCard>
                  <div className="cn-card hc-deal">
                    <div className="hc-deal__head">
                      <span className={`cn-badge ${verdictBadgeClass(d.verdict)}`}>
                        <span className="cn-badge__dot" aria-hidden />
                        {d.verdict}
                      </span>
                    </div>

                    <div className="hc-deal__thumb">
                      {d.imageUrl ? (
                        <img src={d.imageUrl} alt="" width={300} height={375} loading="lazy" />
                      ) : (
                        <span className="hc-deal__ph" aria-hidden>◆</span>
                      )}
                    </div>

                    <h3 className="hc-deal__title">{d.title}</h3>

                    <div className="hc-deal__price-row">
                      <span className="hc-deal__price">{formatCad(d.priceCad)}</span>
                      <span className={`hc-deal__score ${high ? "hc-deal__score--high" : ""}`}>
                        <strong>{fmtScore(score)}</strong>
                        <span>/ 10</span>
                      </span>
                    </div>

                    {d.player?.name && (
                      <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--ghost)", fontFamily: "var(--cn-mono)", letterSpacing: "0.04em" }}>
                        {d.player.name}
                      </p>
                    )}
                  </div>
                </TiltCard>
              </Reveal>
            );
          })
        ) : null}
      </div>

      <Reveal>
        <div style={{ textAlign: "center", marginTop: "2.5rem" }}>
          <Link href="/deals" className="cn-btn">
            VOIR TOUS LES DEALS
            <IconArrow width={14} height={14} />
          </Link>
        </div>
      </Reveal>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
  { icon: "⚡", strong: "Score généré en < 3 secondes", rest: "par l'IA Claude." },
  { icon: "🔍", strong: "7 facteurs analysés", rest: "— stats, âge, momentum, marché, liquidité, upside, hype." },
  { icon: "🎯", strong: "Verdict actionnable", rest: "— Acheter, Surveiller ou Éviter. Pas de jargon." },
  { icon: "📈", strong: "Calibré sur eBay CA live", rest: "— prix réels, pas des estimations figées." },
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
            L&apos;IA LIT ENTRE<br />LES LIGNES<br />DES STATS.
          </h2>
          <p className="cn-body" style={{ margin: "1.5rem 0 2rem" }}>
            Pendant que tu regardes les points, Card Scout croise la trajectoire,
            l&apos;âge, le momentum, la liquidité du marché et 3 autres facteurs.
            Le résultat : un score 0–10 clair, avec le raisonnement derrière.
          </p>
          <ul className="hc-bullets">
            {SCORE_BULLETS.map((b) => (
              <li key={b.strong} className="hc-bullet">
                <span className="hc-bullet__icon" aria-hidden>{b.icon}</span>
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

        {/* mock side */}
        <Reveal index={1} className="hc-two-col__visual">
          <TiltCard maxTilt={4}>
            <ScoreMock />
          </TiltCard>
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

/* ─── Stats ─────────────────────────────────────────────────────────────────── */

const STATS = [
  { value: 900, suffix: "+", label: "JOUEURS ANALYSÉS", accent: "ice" },
  { value: 32,  suffix: "",  label: "ÉQUIPES NHL",       accent: null },
  { value: 7,   suffix: "",  label: "FACTEURS IA",       accent: "gold" },
  { value: 100, suffix: "%", label: "GRATUIT",           accent: null },
];

function StatsSection() {
  return (
    <section className="hc-section hc-stats-section" aria-label="Chiffres clés">
      <Reveal>
        <div className="hc-stats">
          {STATS.map((s, i) => (
            <div key={s.label} className="hc-stat">
              <span className={`hc-stat__value ${s.accent ? `hc-stat__value--${s.accent}` : ""}`}>
                <CountUp value={s.value} decimals={0} suffix={s.suffix} duration={1400 + i * 100} />
              </span>
              <span className="hc-stat__label">{s.label}</span>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="hc-footer">
      <div className="hc-footer__inner">
        <span className="hc-footer__brand">
          CARD <span className="hc-footer__brand-ice">SCOUT</span>
        </span>
        <nav className="hc-footer__links" aria-label="Navigation pied de page">
          <Link href="/deals" className="hc-footer__link">Deals</Link>
          <Link href="/opportunites" className="hc-footer__link">Opportunités</Link>
          <Link href="/analyse" className="hc-footer__link">Analyser</Link>
        </nav>
      </div>
    </footer>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────────── */

export default function HomeCinematic({ carouselPlayers: initialPlayers = [] }) {
  const [carouselPlayers, setCarouselPlayers] = useState(initialPlayers);
  const [carouselLoading, setCarouselLoading] = useState(
    initialPlayers.length === 0
  );

  useEffect(() => {
    if (initialPlayers.length > 0) return;
    let cancelled = false;
    fetch("/api/trending")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setCarouselPlayers(
            Array.isArray(data?.carouselPlayers) ? data.carouselPlayers : []
          );
        }
      })
      .catch(() => {
        if (!cancelled) setCarouselPlayers([]);
      })
      .finally(() => {
        if (!cancelled) setCarouselLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialPlayers.length]);

  return (
    <main className="hc-page cinematic">
      <ScrollProgress />
      <Atmosphere />

      <div className="hc-nav">
        <div className="hc-nav__inner">
          <AppNav active="home" />
        </div>
      </div>

      <HeroSection
        carouselPlayers={carouselPlayers}
        carouselLoading={carouselLoading}
      />
      <HowItWorksSection />
      <TopDealsSection />
      <ScoreSection />
      <AnalyseSection />
      <StatsSection />
      <Footer />
    </main>
  );
}
