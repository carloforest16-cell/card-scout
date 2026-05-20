import Link from "next/link";

import {
  HomeHotSection,
  HomeHowSection,
  HomeStealsSection,
} from "../HomePageSections";
import HomePlayerSearch from "../HomePlayerSearch";
import HomePremiumHeroCarousel from "./HomePremiumHeroCarousel";
import HomePremiumScoreAiMock from "./HomePremiumScoreAiMock";

export function HomePremiumNav() {
  return (
    <header className="hp-nav">
      <div className="hp-shell hp-nav__inner">
        <Link href="/" className="hp-nav__logo">
          Card <span>Scout</span>
        </Link>
        <nav className="hp-nav__links" aria-label="Navigation principale">
          <Link className="hp-nav__link" href="/deals">
            Investment Intelligence
          </Link>
          <Link className="hp-nav__link" href="/opportunites">
            Opportunités
          </Link>
          <a className="hp-nav__link" href="#ai-deals">
            Découvrir
          </a>
          <a className="hp-nav__link" href="#comment-ca-marche">
            Comment ça marche
          </a>
        </nav>
        <a className="hp-btn hp-btn--solid hp-nav__cta" href="#search">
          Commencer
        </a>
      </div>
    </header>
  );
}

/**
 * @param {object} props
 * @param {Array<object>} props.carouselPlayers — profils trending avec score (serveur)
 */
export function HomePremiumHero({ carouselPlayers }) {
  return (
    <section className="hp-hero" aria-labelledby="hp-hero-heading">
      <div className="hp-hero__glow" aria-hidden="true" />
      <div className="hp-shell hp-hero__grid">
        <div className="hp-hero__copy">
          <p className="hp-hero__badge">
            <span aria-hidden="true">⚡</span> Powered by AI
          </p>
          <h1 id="hp-hero-heading" className="hp-hero__title">
            Les cartes NHL ont bougé cette semaine.{" "}
            <span className="hp-hero__title-accent">Card Scout le sait déjà.</span>
          </h1>
          <p className="hp-hero__subtitle">
            L&apos;IA analyse en temps réel les stats NHL et le marché eBay pour
            identifier les cartes undervalued avant que tout le monde réagisse.
          </p>
          <div id="search" className="hp-hero__search">
            <HomePlayerSearch compact premium />
          </div>
          <ul className="hp-hero__bullets">
            <li>
              <span className="hp-hero__check" aria-hidden="true">
                ✓
              </span>{" "}
              Analyse IA en temps réel
            </li>
            <li>
              <span className="hp-hero__check" aria-hidden="true">
                ✓
              </span>{" "}
              Prix eBay live
            </li>
            <li>
              <span className="hp-hero__check" aria-hidden="true">
                ✓
              </span>{" "}
              Gratuit
            </li>
          </ul>
          <div className="hp-hero__cta-row">
            <a className="hp-btn hp-btn--solid hp-btn--lg" href="#ai-deals">
              Découvrir les deals
            </a>
            <a className="hp-btn hp-btn--ghost hp-btn--lg" href="#score">
              Voir un exemple
            </a>
          </div>
        </div>
        <div className="hp-hero__visual">
          <HomePremiumHeroCarousel players={carouselPlayers ?? []} />
        </div>
      </div>
    </section>
  );
}

export function HomePremiumStatsBar() {
  const items = [
    { value: "32", label: "Équipes NHL", accent: "cyan" },
    { value: "900+", label: "Joueurs", accent: "violet" },
    { value: "<1s", label: "Score IA", accent: "neon" },
    { value: "eBay", label: "Live", accent: "green" },
  ];
  return (
    <section className="hp-stats" aria-label="Indicateurs clés">
      <div className="hp-stats__inner">
        <div className="hp-stats__grid">
        {items.map((it) => (
          <div key={`${it.value}-${it.label}`} className={`hp-stat hp-stat--${it.accent}`}>
            <p className="hp-stat__value">{it.value}</p>
            <p className="hp-stat__label">{it.label}</p>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}

/**
 * @param {object} props
 * @param {Array<object>} props.steals
 * @param {boolean} props.stealsUsedPrice
 */
export function HomePremiumAiFinder({ steals, stealsUsedPrice }) {
  return (
    <section className="hp-section hp-section--ai" id="ai-deals" aria-labelledby="hp-ai-heading">
      <div className="hp-shell">
        <p className="hp-kicker">🤖 AI POWERED</p>
        <h2 id="hp-ai-heading" className="hp-section__title">
          L&apos;IA trouve les deals avant toi
        </h2>
        <p className="hp-section__lede">
          Modèles calibrés sur les stats NHL et les flux eBay pour scorer chaque profil et
          repérer les écarts de prix avant le marché.
        </p>
        <HomeStealsSection
          steals={steals}
          stealsUsedPrice={stealsUsedPrice}
          hideHeader
        />
      </div>
    </section>
  );
}

export function HomePremiumScoreSection() {
  return (
    <section className="hp-section hp-section--score" id="score" aria-labelledby="hp-score-heading">
      <div className="hp-shell hp-score2-layout">
        <div className="hp-score2-copy">
          <p className="hp-score2-badge">
            <span aria-hidden="true">⚡</span> PROPULSÉ PAR CLAUDE AI
          </p>
          <h2 id="hp-score-heading" className="hp-score2-title">
            L&apos;IA lit entre les lignes des stats
          </h2>
          <p className="hp-score2-lede">
            Pendant que tu regardes les points, Card Scout analyse la trajectoire,
            l&apos;âge, le momentum et le marché. En secondes.
          </p>
          <ul className="hp-score2-highlights">
            <li>
              <span className="hp-score2-hl-ico" aria-hidden="true">
                🔍
              </span>
              <span>
                <strong>Analyse 15+ variables</strong> par joueur
              </span>
            </li>
            <li>
              <span className="hp-score2-hl-ico" aria-hidden="true">
                ⚡
              </span>
              <span>
                <strong>Score généré en &lt; 3 secondes</strong>
              </span>
            </li>
            <li>
              <span className="hp-score2-hl-ico" aria-hidden="true">
                🎯
              </span>
              <span>
                <strong>Verdict clair :</strong> Acheter, Surveiller ou Éviter
              </span>
            </li>
          </ul>
          <blockquote className="hp-score2-quote">
            Comme avoir un analyste de marché qui ne dort jamais.
          </blockquote>
        </div>
        <HomePremiumScoreAiMock />
      </div>
    </section>
  );
}

/**
 * @param {object} props
 * @param {Array<object>} props.hot
 */
export function HomePremiumTrending({ hot }) {
  return (
    <section className="hp-section hp-section--trend" id="trending" aria-labelledby="hp-trend-heading">
      <div className="hp-shell">
        <p className="hp-kicker">🔥 LIVE</p>
        <h2 id="hp-trend-heading" className="hp-section__title">
          Trending Now
        </h2>
        <p className="hp-section__lede hp-section__lede--tight">
          Les profils qui bougent le plus cette semaine — scores Card Scout en direct.
        </p>
        <HomeHotSection hot={hot} hideHeader />
      </div>
    </section>
  );
}

/**
 * Aperçu Investment Intelligence (ex. Cole Caufield) — données serveur.
 * @param {object} props
 * @param {object | null} props.dealPreview — payload /api/deals ou null
 */
export function HomePremiumDealFinder({ dealPreview }) {
  const formatCad = (n) =>
    new Intl.NumberFormat("fr-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2,
    }).format(n);

  const formatScore = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return (Math.round(x * 10) / 10).toFixed(1);
  };

  const top = dealPreview?.listings?.slice(0, 3) ?? [];

  return (
    <section
      className="hp-section hp-section--dealfinder"
      id="deal-finder"
      aria-labelledby="hp-dealfinder-heading"
    >
      <div className="hp-shell">
        <p className="hp-dealfinder-badge">
          <span aria-hidden="true">📈</span> INVESTMENT INTELLIGENCE
        </p>
        <h2 id="hp-dealfinder-heading" className="hp-section__title">
          Les meilleures opportunités du moment
        </h2>
        <p className="hp-section__lede hp-section__lede--tight">
          Score d&apos;investissement par l&apos;IA — triées du meilleur au plus faible (exemple{" "}
          <strong>Cole Caufield</strong>).
        </p>

        {top.length > 0 ? (
          <div className="hp-dealfinder-preview">
            <div className="hp-dealfinder-market">
              <p className="hp-dealfinder-market__label">Top 3</p>
              <p className="hp-dealfinder-market__value">
                {dealPreview.validListings} annonces analysées
                {dealPreview.mocked ? " · démo" : ""}
              </p>
              <p className="hp-dealfinder-market__meta">
                {dealPreview.totalListings} résultats eBay bruts
              </p>
            </div>

            <ul className="hp-dealfinder-deals">
              {top.map((d) => (
                <li
                  key={`${d.listingIndex}-${d.title}-${d.price}`}
                  className="hp-dealfinder-deal"
                >
                  <div className="hp-dealfinder-deal__thumb">
                    {d.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- eBay
                      <img src={d.imageUrl} alt="" width={72} height={72} loading="lazy" />
                    ) : (
                      <span className="hp-dealfinder-deal__ph">◆</span>
                    )}
                  </div>
                  <div className="hp-dealfinder-deal__body">
                    <span className="hp-dealfinder-deal__tag">{d.verdict}</span>
                    <span className="hp-dealfinder-deal__badge">
                      Score {formatScore(d.investmentScore)}/10
                    </span>
                    <p className="hp-dealfinder-deal__title">{d.title}</p>
                    <p className="hp-dealfinder-deal__row">
                      <span className="hp-dealfinder-deal__price">{formatCad(d.price)}</span>
                      {d.price < d.marketPrice ? (
                        <span className="hp-dealfinder-deal__strike">
                          {formatCad(d.marketPrice)}
                        </span>
                      ) : (
                        <span className="hp-dealfinder-deal__meta-price">
                          {formatCad(d.marketPrice)}
                        </span>
                      )}
                    </p>
                    {d.url ? (
                      <a
                        className="hp-dealfinder-deal__link"
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                      >
                        Voir sur eBay
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="hp-dealfinder-empty">
            Aperçu indisponible. Lance une analyse sur la page Investment Intelligence.
          </p>
        )}

        <div className="hp-dealfinder-cta">
          <Link href="/deals" className="hp-btn hp-btn--solid hp-btn--lg">
            Voir toutes les opportunités
          </Link>
        </div>
      </div>
    </section>
  );
}

export function HomePremiumFooter() {
  return (
    <footer className="hp-footer">
      <div className="hp-shell hp-footer__inner">
        <p className="hp-footer__logo">
          Card <span>Scout</span>
        </p>
        <p className="hp-footer__tagline">Intelligence de marché pour cartes NHL.</p>
        <p className="hp-footer__copy">© {new Date().getFullYear()} Card Scout</p>
      </div>
    </footer>
  );
}
