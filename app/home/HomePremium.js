/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import AppNav from "../AppNav";
import HomePlayerSearch from "../HomePlayerSearch";
import AnimatedStat from "./AnimatedStat";
import HomePremium3DShowcase from "./HomePremium3DShowcase";
import HomePremiumScoreAiMock from "./HomePremiumScoreAiMock";
import ScrollReveal from "./ScrollReveal";
import SpotlightCard from "./SpotlightCard";

// ─── Nav ─────────────────────────────────────────────────────────────────────

export function HomePremiumNav() {
  return (
    <header className="cs-nav-bar cs-nav-bar--sticky">
      <div className="hp-shell cs-nav-bar__inner">
        <AppNav />
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

export function HomePremiumHero({ carouselPlayers }) {
  return (
    <section className="hp-hero" aria-labelledby="hp-hero-heading">
      {/* Animated background */}
      <div className="hp-hero__backdrop" aria-hidden="true">
        <div className="hp-hero__blob hp-hero__blob--1" />
        <div className="hp-hero__blob hp-hero__blob--2" />
        <div className="hp-hero__blob hp-hero__blob--3" />
        <div className="hp-hero__grid-pattern" />
        <div className="hp-hero__vignette" />
      </div>

      {/* Centered content */}
      <div className="hp-hero__stage">
        <p className="hp-hero__eyebrow">
          <span className="hp-hero__live-dot" aria-hidden="true" />
          Analyse temps réel · eBay Live · Gratuit
        </p>

        <h1 id="hp-hero-heading" className="hp-hero__title">
          Les cartes NHL ont bougé.{" "}
          <span className="hp-hero__title-accent">
            Card&nbsp;Scout le savait déjà.
          </span>
        </h1>

        <p className="hp-hero__subtitle">
          L&apos;IA scanne les stats NHL et le marché eBay pour repérer les
          cartes undervalued avant que tout le monde réagisse.
        </p>

        <div className="hp-hero__search-wrap">
          <HomePlayerSearch compact premium />
        </div>

        <div className="hp-hero__cta-row">
          <a className="hp-btn hp-btn--solid hp-btn--xl" href="#deals">
            Voir les opportunités
          </a>
          <a className="hp-btn hp-btn--glass hp-btn--xl" href="#score">
            Comment ça marche
          </a>
        </div>
      </div>

      {/* 3D player coverflow showcase at bottom of hero */}
      <div className="hp-hero__strip">
        <HomePremium3DShowcase players={carouselPlayers ?? []} />
      </div>

      <div className="hp-hero__scroll-cue" aria-hidden="true">
        <div className="hp-scroll-cue__line" />
        <div className="hp-scroll-cue__dot" />
      </div>
    </section>
  );
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "900", suffix: "+", label: "Joueurs analysés", accent: "cyan" },
  { value: "32",  suffix: "",  label: "Équipes NHL",      accent: "violet" },
  { value: "7",   suffix: "",  label: "Facteurs IA",      accent: "neon" },
  { value: "100", suffix: "%", label: "Gratuit",          accent: "green" },
];

export function HomePremiumStatsBar() {
  return (
    <ScrollReveal as="section" className="hp-stats" aria-label="Chiffres clés">
      <div className="hp-shell hp-stats__grid">
        {STATS.map((s) => (
          <AnimatedStat
            key={s.label}
            value={s.value}
            suffix={s.suffix}
            label={s.label}
            accent={s.accent}
          />
        ))}
      </div>
    </ScrollReveal>
  );
}

// ─── Bento Features ───────────────────────────────────────────────────────────

const BENTO_FACTORS = [
  { label: "Performance", fill: "88", color: "var(--hp-neon)" },
  { label: "Momentum",    fill: "93", color: "var(--hp-green)" },
  { label: "Marché eBay", fill: "76", color: "var(--hp-cyan)" },
  { label: "Âge / Upside",fill: "82", color: "#a78bfa" },
];

export function HomePremiumBentoFeatures() {
  return (
    <ScrollReveal
      as="section"
      className="hp-bento-section"
      aria-labelledby="hp-bento-heading"
    >
      <div className="hp-shell">
        <p className="hp-kicker">Pourquoi Card Scout</p>
        <h2 id="hp-bento-heading" className="hp-section__title">
          Tout ce qu&apos;il faut pour investir intelligemment
        </h2>

        <div className="hp-bento">
          {/* Card 1 — Score IA (tall, left) */}
          <SpotlightCard className="hp-bento__card hp-bento__card--main" color="red">
            <div className="hp-bento__card-inner">
              <span className="hp-bento__tag hp-bento__tag--ai">Intelligence artificielle</span>
              <h3 className="hp-bento__card-title">Score IA généré en&nbsp;&lt;&nbsp;3&nbsp;secondes</h3>
              <p className="hp-bento__card-desc">
                Claude analyse 15+ variables — stats, trajectoire, âge, marché
                eBay — et retourne un score 0–10 avec verdict actionnable.
              </p>

              <div className="hp-bento__bars" role="list" aria-label="Facteurs du score">
                {BENTO_FACTORS.map((f) => (
                  <div key={f.label} className="hp-bento__bar-item" role="listitem">
                    <span className="hp-bento__bar-label">{f.label}</span>
                    <div className="hp-bento__bar-track" aria-hidden="true">
                      <div
                        className="hp-bento__bar-fill"
                        style={{ "--fill-w": `${f.fill}%`, "--fill-color": f.color }}
                      />
                    </div>
                    <span className="hp-bento__bar-val" style={{ color: f.color }}>
                      {(parseFloat(f.fill) / 10).toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="hp-bento__score-chip">
                <span className="hp-bento__score-chip-label">Card Scout Score</span>
                <span className="hp-bento__score-chip-val">8.5</span>
                <span className="hp-bento__score-chip-max">/10</span>
              </div>
            </div>
          </SpotlightCard>

          {/* Card 2 — eBay Live */}
          <SpotlightCard className="hp-bento__card hp-bento__card--ebay" color="cyan">
            <div className="hp-bento__card-inner">
              <span className="hp-bento__tag hp-bento__tag--ebay">Données live</span>
              <h3 className="hp-bento__card-title">Prix eBay en temps réel</h3>
              <p className="hp-bento__card-desc">
                Listings actifs scannés à chaque analyse. Aucun prix figé.
              </p>
              <div className="hp-bento__price-demo">
                <div className="hp-bento__price-row">
                  <span className="hp-bento__price-badge">LIVE</span>
                  <span className="hp-bento__price-amount">$14.99</span>
                  <span className="hp-bento__price-cur">CAD</span>
                </div>
                <p className="hp-bento__price-meta">Dernière mise à jour · maintenant</p>
              </div>
            </div>
          </SpotlightCard>

          {/* Card 3 — Verdict */}
          <SpotlightCard className="hp-bento__card hp-bento__card--verdict" color="green">
            <div className="hp-bento__card-inner">
              <span className="hp-bento__tag hp-bento__tag--verdict">Verdict clair</span>
              <h3 className="hp-bento__card-title">Acheter, Surveiller ou Éviter</h3>
              <p className="hp-bento__card-desc">
                Pas de jargon. Un verdict actionnable sur chaque carte.
              </p>
              <div className="hp-bento__verdicts">
                <span className="hp-verdict hp-verdict--buy">
                  <span className="hp-verdict__dot" aria-hidden="true" />Acheter
                </span>
                <span className="hp-verdict hp-verdict--watch">
                  <span className="hp-verdict__dot" aria-hidden="true" />Surveiller
                </span>
                <span className="hp-verdict hp-verdict--pass">
                  <span className="hp-verdict__dot" aria-hidden="true" />Éviter
                </span>
              </div>
            </div>
          </SpotlightCard>
        </div>
      </div>
    </ScrollReveal>
  );
}

// ─── Score Section ────────────────────────────────────────────────────────────

export function HomePremiumScoreSection() {
  return (
    <ScrollReveal
      as="section"
      className="hp-section hp-section--score"
      id="score"
      aria-labelledby="hp-score-heading"
    >
      <div className="hp-shell hp-score2-layout">
        <div className="hp-score2-copy">
          <p className="hp-score2-badge">⚡ PROPULSÉ PAR CLAUDE AI</p>
          <h2 id="hp-score-heading" className="hp-score2-title">
            L&apos;IA lit entre les lignes des stats
          </h2>
          <p className="hp-score2-lede">
            Pendant que tu regardes les points, Card Scout analyse la
            trajectoire, l&apos;âge, le momentum et le marché. En secondes.
          </p>
          <ul className="hp-score2-highlights">
            <li><span aria-hidden="true">🔍</span><span><strong>Analyse 15+ variables</strong> par joueur</span></li>
            <li><span aria-hidden="true">⚡</span><span><strong>Score généré en &lt; 3 secondes</strong></span></li>
            <li><span aria-hidden="true">🎯</span><span><strong>Verdict clair :</strong> Acheter, Surveiller ou Éviter</span></li>
          </ul>
          <blockquote className="hp-score2-quote">
            Comme avoir un analyste de marché qui ne dort jamais.
          </blockquote>
          <Link href="/opportunites" className="hp-btn hp-btn--solid hp-btn--lg" style={{ marginTop: "1.5rem", display: "inline-flex" }}>
            Voir les opportunités joueurs
          </Link>
        </div>
        <HomePremiumScoreAiMock />
      </div>
    </ScrollReveal>
  );
}

// ─── Deal Finder ──────────────────────────────────────────────────────────────

export function HomePremiumDealFinder({ dealPreview }) {
  const fmt = (n) =>
    new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(n);
  const fmtScore = (n) => {
    const x = Number(n);
    return Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : "—";
  };

  const top = dealPreview?.listings?.slice(0, 3) ?? [];

  return (
    <ScrollReveal
      as="section"
      className="hp-section hp-section--dealfinder"
      id="deals"
      aria-labelledby="hp-dealfinder-heading"
    >
      <div className="hp-shell">
        <p className="hp-dealfinder-badge"><span aria-hidden="true">📈</span> MARCHÉ DES CARTES</p>
        <h2 id="hp-dealfinder-heading" className="hp-section__title">
          Les meilleures opportunités du moment
        </h2>
        <p className="hp-section__lede hp-section__lede--tight">
          Score d&apos;investissement par l&apos;IA (exemple <strong>Cole Caufield</strong>).
        </p>

        {top.length > 0 ? (
          <div className="hp-dealfinder-preview">
            <div className="hp-dealfinder-market">
              <p className="hp-dealfinder-market__label">Top 3</p>
              <p className="hp-dealfinder-market__value">
                {dealPreview.validListings} annonces{dealPreview.mocked ? " · démo" : ""}
              </p>
              <p className="hp-dealfinder-market__meta">{dealPreview.totalListings} résultats eBay bruts</p>
            </div>
            <ul className="hp-dealfinder-deals">
              {top.map((d) => (
                <li key={`${d.listingIndex}-${d.title}`} className="hp-dealfinder-deal">
                  <div className="hp-dealfinder-deal__thumb">
                    {d.imageUrl
                      ? <img src={d.imageUrl} alt="" width={72} height={72} loading="lazy" />
                      : <span className="hp-dealfinder-deal__ph">◆</span>}
                  </div>
                  <div className="hp-dealfinder-deal__body">
                    <span className="hp-dealfinder-deal__tag">{d.verdict}</span>
                    <span className="hp-dealfinder-deal__badge">Score {fmtScore(d.investmentScore)}/10</span>
                    <p className="hp-dealfinder-deal__title">{d.title}</p>
                    <p className="hp-dealfinder-deal__row">
                      <span className="hp-dealfinder-deal__price">{fmt(d.price)}</span>
                      {d.price < d.marketPrice
                        ? <span className="hp-dealfinder-deal__strike">{fmt(d.marketPrice)}</span>
                        : <span className="hp-dealfinder-deal__meta-price">{fmt(d.marketPrice)}</span>}
                    </p>
                    {d.url && (
                      <a className="hp-dealfinder-deal__link" href={d.url} target="_blank" rel="noopener noreferrer sponsored">
                        Voir sur eBay →
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="hp-dealfinder-empty">Aperçu indisponible. Lance une analyse sur la page Marché des Cartes.</p>
        )}

        <div className="hp-dealfinder-cta">
          <Link href="/deals" className="hp-btn hp-btn--solid hp-btn--lg">Voir le Marché des Cartes</Link>
        </div>
      </div>
    </ScrollReveal>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function HomePremiumFooter() {
  return (
    <footer className="hp-footer">
      <div className="hp-shell hp-footer__inner">
        <div className="hp-footer__brand">
          <p className="hp-footer__logo">Card <span>Scout</span></p>
          <p className="hp-footer__tagline">Intelligence de marché pour cartes NHL.</p>
        </div>
        <nav className="hp-footer__nav" aria-label="Liens footer">
          <Link href="/deals" className="hp-footer__link">Marché des Cartes</Link>
          <Link href="/opportunites" className="hp-footer__link">Opportunités Joueurs</Link>
        </nav>
        <p className="hp-footer__copy">
          © {new Date().getFullYear()} Card Scout · Données eBay &amp; NHL en temps réel
        </p>
      </div>
    </footer>
  );
}
