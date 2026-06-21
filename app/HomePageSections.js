/* eslint-disable @next/next/no-img-element -- URLs NHLE / assets dynamiques */
import Link from "next/link";

function ScoreBadge({ score, tier }) {
  if (score == null) {
    return <span className="home-p-score home-p-score--na">—</span>;
  }
  const cls = `home-p-score home-p-score--${tier || "unknown"}`;
  return (
    <span className={cls}>
      <span className="home-p-score__value">{score}</span>
      <span className="home-p-score__max">/10</span>
    </span>
  );
}

/**
 * @param {object} props
 * @param {Array<{ id: string; name: string; team: string; headshotUrl: string; points: string; score: number | null; tier: string }>} props.hot
 * @param {boolean} [props.hideHeader]
 */
export function HomeHotSection({ hot, hideHeader = false }) {
  return (
    <section className="home-block home-block--hot" aria-labelledby="home-hot-heading">
      {hideHeader ? (
        <h2 id="home-hot-heading" className="visually-hidden">
          Trending Now — En feu cette semaine
        </h2>
      ) : null}
      {hideHeader ? null : (
        <div className="home-block__head">
          <h2 id="home-hot-heading" className="home-block__title">
            En feu cette semaine
            <span className="home-block__emoji" aria-hidden="true">
              {" "}
              🔥
            </span>
          </h2>
          <p className="home-block__lede">
            Top 5 Card Metrics Score parmi les stars les plus suivies.
          </p>
        </div>
      )}
      {hot.length === 0 ? (
        <p className="home-block__empty">Données indisponibles pour le moment.</p>
      ) : (
        <div className="home-scroll">
          <ul className="home-scroll__track">
            {hot.map((p) => (
              <li key={p.id} className="home-scroll__cell">
                <Link href={`/player/${p.id}`} className="home-p-card">
                  <div className="home-p-card__photo">
                    <img
                      src={p.headshotUrl}
                      alt=""
                      width={200}
                      height={250}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="home-p-card__body">
                    <p className="home-p-card__name">{p.name}</p>
                    <p className="home-p-card__team">{p.team}</p>
                    <div className="home-p-card__row">
                      <ScoreBadge score={p.score} tier={p.tier} />
                      <span className="home-p-card__pts">
                        <span className="home-p-card__pts-label">PTS</span>
                        <span className="home-p-card__pts-val">{p.points}</span>
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * @param {object} props
 * @param {Array<{ id: string; name: string; team: string; headshotUrl: string; points: string; score: number | null; tier: string; avgPriceCad: number | null }>} props.steals
 * @param {boolean} props.stealsUsedPrice
 * @param {boolean} [props.hideHeader]
 */
export function HomeStealsSection({ steals, stealsUsedPrice, hideHeader = false }) {
  return (
    <section className="home-block home-block--steals" aria-labelledby="home-steals-heading">
      {hideHeader ? (
        <h2 id="home-steals-heading" className="visually-hidden">
          Meilleurs deals en ce moment
        </h2>
      ) : null}
      {hideHeader ? null : (
        <div className="home-block__head">
          <h2 id="home-steals-heading" className="home-block__title">
            Meilleurs deals en ce moment
            <span className="home-block__emoji" aria-hidden="true">
              {" "}
              💰
            </span>
          </h2>
          <p className="home-block__lede">
            {stealsUsedPrice
              ? "Score élevé (7+) et annonces eBay sous ~100 $ CA en moyenne."
              : "Sélection proxy : meilleurs scores (7+) — branche eBay pour affiner avec les prix réels."}
          </p>
        </div>
      )}
      {steals.length === 0 ? (
        <p className="home-block__empty">Aucun profil ne correspond aux critères.</p>
      ) : (
        <div className="home-steals-wrap">
          <div className="home-steals-grid">
          {steals.map((p) => (
            <Link key={p.id} href={`/player/${p.id}`} className="home-steal-card">
              <span className="home-steal-card__badge">DEAL</span>
              <div className="home-steal-card__photo">
                <img
                  src={p.headshotUrl}
                  alt=""
                  width={180}
                  height={225}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="home-steal-card__body">
                <p className="home-steal-card__name">{p.name}</p>
                <p className="home-steal-card__team">{p.team}</p>
                <ScoreBadge score={p.score} tier={p.tier} />
                {p.avgPriceCad != null ? (
                  <p className="home-steal-card__meta">
                    ~{p.avgPriceCad.toFixed(0)} $ CA / annonces
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * @param {object} [props]
 * @param {boolean} [props.premium]
 */
export function HomeHowSection({ premium = false }) {
  if (premium) {
    return (
      <section
        className="home-how home-how--premium"
        aria-labelledby="home-how-heading"
        id="comment-ca-marche"
      >
        <div className="home-how__inner home-how__inner--premium">
          <h2 id="home-how-heading" className="hp-how__title">
            Comment ça marche
          </h2>
          <ol className="hp-how__steps">
            <li className="hp-how__step">
              <span className="hp-how__num" aria-hidden="true">
                1
              </span>
              <div className="hp-how__body">
                <h3 className="hp-how__step-title">Recherche un joueur NHL</h3>
                <p className="hp-how__step-text">
                  Tape un nom : suggestions officielles et fiche complète en un clic.
                </p>
              </div>
            </li>
            <li className="hp-how__step">
              <span className="hp-how__num" aria-hidden="true">
                2
              </span>
              <div className="hp-how__body">
                <h3 className="hp-how__step-title">Analyse ses stats et le marché des cartes</h3>
                <p className="hp-how__step-text">
                  Saison en cours, historique NHL et annonces eBay regroupés au même endroit.
                </p>
              </div>
            </li>
            <li className="hp-how__step">
              <span className="hp-how__num" aria-hidden="true">
                3
              </span>
              <div className="hp-how__body">
                <h3 className="hp-how__step-title">Identifie les opportunités undervalued</h3>
                <p className="hp-how__step-text">
                  Le Card Metrics Score t’aide à prioriser où creuser sur le marché des cartes.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section className="home-how" aria-labelledby="home-how-heading">
      <div className="home-how__inner">
        <h2 id="home-how-heading" className="home-block__title home-block__title--center">
          Comment ça marche
        </h2>
        <ol className="home-how__steps">
          <li className="home-how__step">
            <span className="home-how__icon" aria-hidden="true">
              🔍
            </span>
            <h3 className="home-how__step-title">Recherche un joueur NHL</h3>
            <p className="home-how__step-text">
              Tape un nom : suggestions officielles et fiche complète en un clic.
            </p>
          </li>
          <li className="home-how__step">
            <span className="home-how__icon" aria-hidden="true">
              📊
            </span>
            <h3 className="home-how__step-title">Analyse ses stats et le marché des cartes</h3>
            <p className="home-how__step-text">
              Saison en cours, historique NHL et annonces eBay regroupés au même endroit.
            </p>
          </li>
          <li className="home-how__step">
            <span className="home-how__icon" aria-hidden="true">
              💡
            </span>
            <h3 className="home-how__step-title">Identifie les opportunités undervalued</h3>
            <p className="home-how__step-text">
              Le Card Metrics Score t’aide à prioriser où creuser sur le marché des cartes.
            </p>
          </li>
        </ol>
      </div>
    </section>
  );
}
