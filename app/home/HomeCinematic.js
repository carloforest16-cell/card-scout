/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";

import { useT } from "../components/PreferencesContext";
import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";
import TiltCard from "../components/TiltCard";
import WelcomeTour from "../components/WelcomeTour";
import "../components/welcome-tour.css";

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
  const t = useT();
  const scrollToHow = () => {
    document.getElementById("comment-ca-marche")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="hc-hero" style={{ position: "relative", overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.jpg"
        alt=""
        aria-hidden
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
      <p className="cn-eyebrow hc-hero__eyebrow" style={{ position: "relative", zIndex: 1 }}>
        <span className="cn-eyebrow__dot" aria-hidden />
        {t("hero.eyebrow")}
      </p>

      <h1 className="hc-hero__title">
        {t("hero.title1")}<br />
        <span className="hc-hero__title-ice">{t("hero.title2")}</span>
      </h1>

      <p className="hc-hero__sub">
        {t("hero.sub").replace(t("hero.sub.bold"), "").trim()}{" "}
        <strong>{t("hero.sub.bold")}</strong>
      </p>

      <div className="hc-hero__ctas">
        <Link href="/deals" className="cn-btn cn-btn--solid hc-hero__cta-primary">
          {t("hero.cta_deals")}
          <IconArrow width={16} height={16} />
        </Link>
        <Link href="/analyse" className="hc-hero__cta-link">
          {t("hero.cta_analyse")} <span aria-hidden>→</span>
        </Link>
      </div>

      <p className="hc-hero__trust">{t("hero.trust")}</p>
    </section>
  );
}

/* ─── How it works ──────────────────────────────────────────────────────────── */

/* ─── Pillar icons (static) ──────────────────────────────────────────────────── */

const IconAnalyseDoc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V9z"/>
    <path d="M10 3v6h9"/><path d="M8 15h8M8 11h4"/>
  </svg>
);
const IconPortfolio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
  </svg>
);

const PILLAR_ACCENTS = {
  ice:  { border: "rgba(0,212,255,0.2)",  bg: "rgba(0,212,255,0.05)",  text: "#00d4ff" },
  gold: { border: "rgba(255,182,30,0.2)", bg: "rgba(255,182,30,0.05)", text: "#ffb61e" },
};

const TRANSP_ICONS = [
  <svg key="beta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>,
  <svg key="prices" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>,
  <svg key="ai" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" /><circle cx="12" cy="15" r="2" /></svg>,
  <svg key="free" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-3-3.87M4 21v-2a4 4 0 0 1 3-3.87" /><circle cx="12" cy="7" r="4" /></svg>,
];

/* ─── How it works / Pillars ────────────────────────────────────────────────── */

function HowItWorksSection() {
  const t = useT();
  const pillars = [
    { icon: <IconAnalyze />,     tag: t("pillar.deals.tag"),     accent: "ice",  title: t("pillar.deals.title"),     body: t("pillar.deals.body"),     href: "/deals",      cta: t("pillar.deals.cta") },
    { icon: <IconAnalyseDoc />,  tag: t("pillar.analyse.tag"),   accent: "gold", title: t("pillar.analyse.title"),   body: t("pillar.analyse.body"),   href: "/analyse",    cta: t("pillar.analyse.cta") },
    { icon: <IconScore />,       tag: t("pillar.score.tag"),     accent: "ice",  title: t("pillar.score.title"),     body: t("pillar.score.body"),     href: "/opportunites", cta: t("pillar.score.cta") },
    { icon: <IconPortfolio />,   tag: t("pillar.portfolio.tag"), accent: "gold", title: t("pillar.portfolio.title"), body: t("pillar.portfolio.body"), href: "/portfolio",  cta: t("pillar.portfolio.cta") },
  ];

  return (
    <section id="comment-ca-marche" className="hc-section hc-features-section" aria-labelledby="hc-how-title">
      <Reveal>
        <p className="cn-eyebrow" style={{ marginBottom: "1rem" }}>
          <span className="cn-eyebrow__dot" aria-hidden />
          {t("pillars.eyebrow")}
        </p>
        <h2 id="hc-how-title" className="cn-h2">
          {t("pillars.title").split("\n").map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </h2>
        <p className="cn-body" style={{ marginTop: "1rem", maxWidth: "52ch" }}>
          {t("pillars.sub")}
        </p>
      </Reveal>

      <div className="hc-features-grid" style={{ marginTop: "2.5rem" }}>
        {pillars.map((p, i) => {
          const ac = PILLAR_ACCENTS[p.accent];
          return (
            <Reveal key={p.tag} index={i}>
              <TiltCard maxTilt={3}>
                <div className="hc-feat" style={{ "--feat-border": ac.border, "--feat-bg": ac.bg, "--feat-text": ac.text }}>
                  <div className="hc-feat__icon-wrap">{p.icon}</div>
                  <span className="hc-feat__tag">{p.tag}</span>
                  <h3 className="hc-feat__title">{p.title}</h3>
                  <p className="hc-feat__body">{p.body}</p>
                  <Link href={p.href} className="hc-feat__link">
                    {p.cta}
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

/* ─── Démo (Deal Finder) ─────────────────────────────────────────────────────── */

const AHA_DEALS_DATA = [
  { type: "Young Guns RC",  grade: "Raw",   price: "$38.00", score: 8.9, verdictKey: "profit", delta: "−22% vs cote" },
  { type: "O-Pee-Chee RC", grade: "PSA 9", price: "$72.00", score: 7.5, verdictKey: "warn",   delta: "±0% vs cote" },
  { type: "Canvas C87",    grade: "Raw",   price: "$14.50", score: 6.4, verdictKey: "loss",   delta: "+12% vs cote" },
];

const VERDICT_KEYS = { profit: "verdict.buy", warn: "verdict.watch", loss: "verdict.pass" };

function DemoSection() {
  const t = useT();
  return (
    <section className="hc-section hc-aha-section" aria-labelledby="hc-demo-title">
      <Reveal>
        <p className="cn-eyebrow" style={{ marginBottom: "0.75rem" }}>
          <span className="cn-eyebrow__dot" aria-hidden />
          {t("demo.eyebrow")}
        </p>
        <h2 id="hc-demo-title" className="cn-h2 hc-aha__title">
          {t("demo.title.prefix")} <span className="hc-aha__player">Cole Caufield</span>
        </h2>
        <p className="cn-body hc-aha__sub">{t("demo.sub")}</p>
      </Reveal>

      <div className="hc-aha__deals">
        {AHA_DEALS_DATA.map((d, i) => (
          <Reveal key={d.type} index={i}>
            <div className={`hc-aha-deal hc-aha-deal--${d.verdictKey}`}>
              <div className="hc-aha-deal__head">
                <span className={`cn-badge cn-badge--${d.verdictKey}`}>
                  <span className="cn-badge__dot" aria-hidden />
                  {t(VERDICT_KEYS[d.verdictKey])}
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
        <div className="hc-aha__cta" style={{ marginTop: "2rem" }}>
          <Link href="/deals?player=Cole+Caufield" className="cn-btn cn-btn--ghost" style={{ fontSize: "0.88rem" }}>
            {t("demo.cta")}
            <IconArrow width={14} height={14} />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

/* ─── Transparence Section ──────────────────────────────────────────────────── */

function TransparenceSection() {
  const t = useT();
  const items = [
    { labelKey: "transp.beta.label",   textKey: "transp.beta.text",   icon: TRANSP_ICONS[0] },
    { labelKey: "transp.prices.label", textKey: "transp.prices.text", icon: TRANSP_ICONS[1] },
    { labelKey: "transp.ai.label",     textKey: "transp.ai.text",     icon: TRANSP_ICONS[2] },
    { labelKey: "transp.free.label",   textKey: "transp.free.text",   icon: TRANSP_ICONS[3] },
  ];

  return (
    <section className="hc-section hc-transparence-section" aria-labelledby="hc-transparence-title">
      <Reveal>
        <p className="cn-eyebrow" style={{ marginBottom: "1rem" }}>
          <span className="cn-eyebrow__dot" aria-hidden />
          {t("transp.eyebrow")}
        </p>
        <h2 id="hc-transparence-title" className="cn-h2">
          {t("transp.title").split("\n").map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </h2>
        <p className="cn-body" style={{ marginTop: "1rem", maxWidth: "54ch" }}>
          {t("transp.sub")}
        </p>
      </Reveal>

      <div className="hc-transparence-grid">
        {items.map((item, i) => (
          <Reveal key={item.labelKey} index={i}>
            <div className="hc-transparence-card">
              <div className="hc-transparence-card__icon">{item.icon}</div>
              <div>
                <h3 className="hc-transparence-card__label">{t(item.labelKey)}</h3>
                <p className="hc-transparence-card__text">{t(item.textKey)}</p>
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
      <HowItWorksSection />
      <DemoSection />
      <TransparenceSection />
    </main>
  );
}
