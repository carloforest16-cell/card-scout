"use client";

/* eslint-disable @next/next/no-img-element -- miniatures eBay tierces */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const STRONG_DEAL_MIN_SCORE = 7;

/** @type {Array<{ id: string; label: string }>} */
const BUDGET_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "under5", label: "Moins de 5$" },
  { id: "5-20", label: "5-20$" },
  { id: "20-50", label: "20-50$" },
  { id: "50-100", label: "50-100$" },
  { id: "100plus", label: "100$+" },
];

/**
 * @param {object} d
 * @returns {boolean}
 */
function isStrongDeal(d) {
  const score = Number(d.investmentScore);
  if (!Number.isFinite(score) || score < STRONG_DEAL_MIN_SCORE) return false;
  return String(d.verdict ?? "")
    .toLowerCase()
    .includes("acheter");
}

/**
 * @param {number} price
 * @param {string} budgetId
 * @returns {boolean}
 */
function matchesBudget(price, budgetId) {
  const p = Number(price);
  if (!Number.isFinite(p)) return false;
  switch (budgetId) {
    case "under5":
      return p < 5;
    case "5-20":
      return p >= 5 && p <= 20;
    case "20-50":
      return p > 20 && p <= 50;
    case "50-100":
      return p > 50 && p <= 100;
    case "100plus":
      return p > 100;
    default:
      return true;
  }
}

function formatCad(n) {
  try {
    return new Intl.NumberFormat("fr-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n} $`;
  }
}

function formatScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return (Math.round(x * 10) / 10).toFixed(1);
}

function scoreBadgeClass(score) {
  if (!Number.isFinite(score)) return "deal-card__score-badge--mid";
  if (score >= 7) return "deal-card__score-badge--high";
  if (score >= 5) return "deal-card__score-badge--mid";
  return "deal-card__score-badge--low";
}

function verdictClass(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "deal-card__verdict--buy";
  if (v.includes("passer")) return "deal-card__verdict--pass";
  return "deal-card__verdict--watch";
}

/**
 * @param {object} props
 * @param {object} props.d
 * @param {boolean} [props.showPlayerChip]
 */
function InvestmentListingCard({ d, showPlayerChip }) {
  const isPass = String(d.verdict).toLowerCase().includes("passer");
  const belowMed = d.price < d.marketPrice;
  return (
    <article
      className={`deal-card${isPass ? " deal-card--pass" : ""}`}
    >
      <div className="deal-card__media">
        {showPlayerChip && d.playerName ? (
          <span className="deal-card__player-chip">{d.playerName}</span>
        ) : null}
        <span
          className={`deal-card__score-badge ${scoreBadgeClass(d.investmentScore)}`}
        >
          Score {formatScore(d.investmentScore)}/10
        </span>
        {d.url ? (
          <a
            className="deal-card__img-link"
            href={d.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            aria-label={`eBay — ${d.title.slice(0, 80)}`}
          >
            {d.imageUrl ? (
              <img
                className="deal-card__img"
                src={d.imageUrl}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="deal-card__img-fallback" aria-hidden>
                eBay
              </span>
            )}
          </a>
        ) : d.imageUrl ? (
          <span className="deal-card__img-link deal-card__img-link--static">
            <img
              className="deal-card__img"
              src={d.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
            />
          </span>
        ) : (
          <span className="deal-card__img-fallback" aria-hidden>
            —
          </span>
        )}
      </div>
      <div className="deal-card__body">
        <div className={`deal-card__verdict ${verdictClass(d.verdict)}`}>
          {d.verdict}
        </div>
        {d.groupDisplayName ? (
          <p className="deal-card__group-name">{d.groupDisplayName}</p>
        ) : null}
        <p className="deal-card__meta-line">
          <span>Hold : {d.holdTimeline}</span>
          <span className="deal-card__dot" aria-hidden>
            ·
          </span>
          <span>Upside : {d.upside}</span>
        </p>
        <h3 className="deal-card__title">{d.title}</h3>
        <p className="deal-card__reason">{d.reason}</p>
        <div className="deal-card__prices">
          <span
            className={`deal-card__price${belowMed ? " deal-card__price--deal" : ""}`}
          >
            {formatCad(d.price)}
          </span>
          {belowMed ? (
            <span className="deal-card__strike">{formatCad(d.marketPrice)}</span>
          ) : (
            <span className="deal-card__market-ref">
              Marché {formatCad(d.marketPrice)}
            </span>
          )}
        </div>
        {d.marketBadge ? (
          <span
            className={`deal-card__market-badge deal-card__market-badge--${d.marketBadgeTone ?? "blue"}`}
          >
            {d.marketBadge}
          </span>
        ) : null}
        {d.url ? (
          <a
            className="deal-card__cta deal-card__cta--outline"
            href={d.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
          >
            Voir sur eBay →
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function DealFinderClient() {
  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestItems, setSuggestItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlayer, setLoadingPlayer] = useState("");
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [cardMode, setCardMode] = useState("raw");
  const [budgetFilter, setBudgetFilter] = useState("all");

  const [hottestLoading, setHottestLoading] = useState(true);
  const [hottestError, setHottestError] = useState(null);
  /** @type {[Array<object> | null, (v: Array<object> | null) => void]} */
  const [hottestCards, setHottestCards] = useState(null);
  const [hottestMocked, setHottestMocked] = useState(false);

  const [underdogLoading, setUnderdogLoading] = useState(true);
  const [underdogError, setUnderdogError] = useState(null);
  /** @type {[Array<object>, (v: Array<object>) => void]} */
  const [underdogPlayers, setUnderdogPlayers] = useState([]);

  const [momentumLoading, setMomentumLoading] = useState(true);
  /** @type {[Array<object>, (v: Array<object>) => void]} */
  const [momentumPlayers, setMomentumPlayers] = useState([]);

  const comboRef = useRef(null);
  const analyzeSectionRef = useRef(null);
  const queryRef = useRef(query);
  const justSelectedRef = useRef(false);
  const cardModeRef = useRef(cardMode);
  const analyzedPlayerRef = useRef(null);
  const hasAnalysisRef = useRef(false);
  queryRef.current = query;
  cardModeRef.current = cardMode;

  const strongDeals = useMemo(() => {
    if (!data?.listings?.length) return [];
    return data.listings.filter(isStrongDeal);
  }, [data]);

  const displayedListings = useMemo(() => {
    return strongDeals.filter((d) => matchesBudget(d.price, budgetFilter));
  }, [strongDeals, budgetFilter]);

  useEffect(() => {
    let cancelled = false;
    setMomentumLoading(true);
    fetch("/api/trending", { method: "GET" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const hot = Array.isArray(json.hot) ? json.hot : [];
        setMomentumPlayers(hot.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setMomentumPlayers([]);
      })
      .finally(() => {
        if (!cancelled) setMomentumLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHottestLoading(true);
    setHottestError(null);
    fetch("/api/deals/hottest", { method: "GET" })
      .then((res) => res.json().then((json) => ({ res, json })))
      .then(({ res, json }) => {
        if (cancelled) return;
        if (!res.ok) {
          setHottestError(json?.error ?? "Chargement impossible");
          setHottestCards([]);
          return;
        }
        setHottestCards(Array.isArray(json.cards) ? json.cards : []);
        setHottestMocked(Boolean(json.mocked));
      })
      .catch(() => {
        if (!cancelled) {
          setHottestError("Chargement impossible");
          setHottestCards([]);
        }
      })
      .finally(() => {
        if (!cancelled) setHottestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setUnderdogLoading(true);
    setUnderdogError(null);
    fetch("/api/underdog", { method: "GET" })
      .then((res) => res.json().then((json) => ({ res, json })))
      .then(({ res, json }) => {
        if (cancelled) return;
        if (!res.ok) {
          setUnderdogError(json?.error ?? "Chargement impossible");
          setUnderdogPlayers([]);
          return;
        }
        const list = Array.isArray(json.players) ? json.players : [];
        setUnderdogPlayers(list.slice(0, 12));
      })
      .catch(() => {
        if (!cancelled) {
          setUnderdogError("Chargement impossible");
          setUnderdogPlayers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setUnderdogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!comboRef.current?.contains(e.target)) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestItems([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      justSelectedRef.current = false;
      return;
    }

    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      setSuggestItems([]);
      setSuggestLoading(false);
      return;
    }

    setSuggestOpen(true);
    setSuggestItems([]);
    setSuggestLoading(true);

    let active = true;
    const t = setTimeout(async () => {
      if (!active) return;
      const captured = q;
      try {
        const res = await fetch(
          `/api/player?q=${encodeURIComponent(captured)}`,
          { method: "GET" }
        );
        const json = await res.json();
        if (!active || queryRef.current.trim() !== captured) return;
        setSuggestItems(Array.isArray(json.results) ? json.results : []);
      } catch {
        if (active && queryRef.current.trim() === captured) {
          setSuggestItems([]);
        }
      } finally {
        if (active && queryRef.current.trim() === captured) {
          setSuggestLoading(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  async function runAnalyze(nameOverride) {
    const name = (nameOverride ?? query).trim();
    if (!name) {
      setError("Entre un nom de joueur.");
      return;
    }
    const mode = cardModeRef.current;
    setSuggestOpen(false);
    setLoading(true);
    setLoadingPlayer(name);
    setError(null);
    setData(null);
    analyzedPlayerRef.current = name;
    hasAnalysisRef.current = true;
    try {
      const res = await fetch(
        `/api/deals?player=${encodeURIComponent(name)}&mode=${encodeURIComponent(mode)}`,
        { method: "GET" }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Analyse impossible");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Impossible de contacter le serveur");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runAnalyze();
  }

  function pickPlayer(p) {
    const n = p?.name?.trim();
    if (!n) return;
    justSelectedRef.current = true;
    setSuggestOpen(false);
    setSuggestItems([]);
    setSuggestLoading(false);
    setQuery(n);
    runAnalyze(n);
  }

  function jumpToAnalyze(playerName) {
    const n = String(playerName ?? "").trim();
    if (!n) return;
    analyzeSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    justSelectedRef.current = true;
    setSuggestOpen(false);
    setSuggestItems([]);
    setSuggestLoading(false);
    setQuery(n);
    runAnalyze(n);
  }

  function handleSearchFocus() {
    if (justSelectedRef.current) return;
    if (query.trim().length >= 2) setSuggestOpen(true);
  }

  function handleSearchKeyDown(e) {
    if (e.key === "Escape") {
      setSuggestOpen(false);
      justSelectedRef.current = false;
    }
  }

  function handleCardModeChange(mode) {
    if (mode === cardMode) return;
    cardModeRef.current = mode;
    setCardMode(mode);
    if (hasAnalysisRef.current && analyzedPlayerRef.current) {
      runAnalyze(analyzedPlayerRef.current);
    }
  }

  return (
    <div className="deals-page">
      <div className="deals-shell">
        <nav className="deals-nav" aria-label="Navigation">
          <Link href="/" className="deals-nav__logo">
            Card <span>Scout</span>
          </Link>
          <Link href="/" className="deals-nav__back">
            ← Accueil
          </Link>
        </nav>

        <header className="deals-hero">
          <p className="deals-hero__badge">
            <span aria-hidden="true">●</span> IA + eBay
          </p>
          <h1 className="deals-hero__title">Investment Intelligence</h1>
          <p className="deals-hero__subtitle">
            Scores d&apos;investissement, médianes par segment et liens directs vers eBay.
          </p>
        </header>

        <section
          ref={analyzeSectionRef}
          className="deals-section deals-section--analyze"
          aria-labelledby="deals-analyze-heading"
        >
          <h2 id="deals-analyze-heading" className="deals-section__title">
            🔍 Analyser un joueur
          </h2>
          <p className="deals-section__lede">
            Recherche NHL + annonces eBay classées et notées par l&apos;IA.
          </p>

          <div className="deals-search" aria-label="Recherche joueur">
            <form className="deals-search__form" onSubmit={handleSubmit}>
              <div className="deals-search__combo" ref={comboRef}>
                <input
                  className="deals-search__input"
                  type="search"
                  autoComplete="off"
                  placeholder="Ex. Cole Caufield"
                  value={query}
                  onChange={(e) => {
                    justSelectedRef.current = false;
                    setQuery(e.target.value);
                  }}
                  onFocus={handleSearchFocus}
                  onKeyDown={handleSearchKeyDown}
                  aria-label="Nom du joueur"
                  aria-controls="deals-suggest-list"
                  aria-expanded={suggestOpen}
                />
                {suggestOpen && (suggestLoading || suggestItems.length > 0) ? (
                  <div id="deals-suggest-list" className="deals-search__suggest">
                    {suggestLoading ? (
                      <div className="deals-empty">Recherche…</div>
                    ) : (
                      suggestItems.map((p) => (
                        <button
                          key={p.playerId ?? p.name}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickPlayer(p)}
                        >
                          {p.name}
                          {p.team ? ` · ${p.team}` : ""}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <button className="deals-search__btn" type="submit" disabled={loading}>
                {loading ? "…" : "Analyser"}
              </button>
            </form>
            <div
              className="deals-card-mode"
              role="radiogroup"
              aria-label="Type de cartes"
            >
              <button
                type="button"
                role="radio"
                aria-checked={cardMode === "raw"}
                className={`deals-card-mode__btn${cardMode === "raw" ? " deals-card-mode__btn--active" : ""}`}
                onClick={() => handleCardModeChange("raw")}
              >
                🃏 Cartes Raw
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={cardMode === "graded"}
                className={`deals-card-mode__btn${cardMode === "graded" ? " deals-card-mode__btn--active" : ""}`}
                onClick={() => handleCardModeChange("graded")}
              >
                🏆 Cartes Gradées
              </button>
            </div>
            <div
              className="deals-budget"
              role="radiogroup"
              aria-label="Budget"
            >
              {BUDGET_FILTERS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={budgetFilter === b.id}
                  className={`deals-budget__btn${budgetFilter === b.id ? " deals-budget__btn--active" : ""}`}
                  onClick={() => setBudgetFilter(b.id)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="deals-alert" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="deals-analysis-loading" aria-live="polite" aria-busy="true">
              <div className="deals-analysis-loading__bar" aria-hidden="true" />
              <p className="deals-analysis-loading__text">
                🧠 L&apos;IA analyse les cartes de {loadingPlayer || query.trim()}...
              </p>
              <div className="deal-cards-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={`analysis-sk-${i}`} className="deals-result-skeleton-card">
                    <div className="deals-result-skeleton-card__media" />
                    <div className="deals-result-skeleton-card__line deals-result-skeleton-card__line--short" />
                    <div className="deals-result-skeleton-card__line" />
                    <div className="deals-result-skeleton-card__line deals-result-skeleton-card__line--price" />
                    <div className="deals-result-skeleton-card__button" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!loading && data ? (
            displayedListings.length > 0 ? (
              <>
                <p className="deals-strip" aria-live="polite">
                  <strong>{displayedListings.length}</strong> deal
                  {displayedListings.length > 1 ? "s" : ""} à acheter{" "}
                  {data.cardMode === "graded" ? "gradés" : "raw"} pour{" "}
                  <strong>{query.trim()}</strong>
                  {budgetFilter !== "all" ? " · budget filtré" : ""}
                  {data.mocked ? " · démo" : ""}
                  {data.claudeUsed ? " · Claude" : ""}
                </p>

                <div className="deal-cards-grid">
                  {displayedListings.map((d) => (
                    <InvestmentListingCard
                      key={`${d.listingIndex}-${d.title}-${d.price}`}
                      d={d}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="deals-empty">
                {strongDeals.length > 0
                  ? "Aucune annonce dans ce budget pour le moment."
                  : "Aucun deal fort trouvé pour ce joueur en ce moment"}
              </p>
            )
          ) : null}
        </section>

        <section
          className="deals-section deals-section--hot"
          aria-labelledby="deals-hot-heading"
        >
          <div className="deals-section--hot__inner">
            <h2 id="deals-hot-heading" className="deals-section__title">
              🔥 Hottest Deals
            </h2>
            <p className="deals-section__lede">
              Top opportunités (score ≥ 8,5) parmi les stars NHL — mises à jour en arrière-plan.
              {hottestMocked ? " Démo sans clé eBay." : ""}
            </p>

            {hottestLoading ? (
              <div className="deal-cards-grid deal-cards-grid--hot" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={`sk-${i}`} className="deals-skeleton-card" />
                ))}
              </div>
            ) : hottestError ? (
              <p className="deals-empty">{hottestError}</p>
            ) : hottestCards?.length ? (
              <div className="deal-cards-grid deal-cards-grid--hot">
                {hottestCards.map((d) => (
                  <InvestmentListingCard
                    key={`hot-${d.playerId ?? "p"}-${d.listingIndex}-${d.title}`}
                    d={d}
                    showPlayerChip
                  />
                ))}
              </div>
            ) : (
              <p className="deals-empty">
                Aucune annonce ≥ 8,5 pour l&apos;instant — lance une analyse joueur ci-dessous.
              </p>
            )}
          </div>
        </section>

        <section
          className="deals-section deals-section--underdog"
          aria-labelledby="deals-underdog-heading"
        >
          <p className="deals-underdog__kicker">🔍 ROOKIE RADAR</p>
          <p className="deals-underdog__badge-label">
            AUTO-DÉTECTÉ · MIS À JOUR CHAQUE SAISON
          </p>
          <h2 id="deals-underdog-heading" className="deals-section__title deals-underdog__title">
            🌟 Talents Cachés
          </h2>
          <p className="deals-section__lede deals-underdog__lede">
            Jeunes joueurs prometteurs détectés par l&apos;algorithme
          </p>

          {underdogLoading ? (
            <div className="deals-underdog-scroll" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={`usk-${i}`} className="deals-underdog-skeleton" />
              ))}
            </div>
          ) : underdogError ? (
            <p className="deals-empty">{underdogError}</p>
          ) : underdogPlayers.length === 0 ? (
            <p className="deals-empty">
              Aucun talent ne correspond aux critères pour le moment.
            </p>
          ) : (
            <div className="deals-underdog-scroll">
              {underdogPlayers.map((p) => (
                <div key={p.playerId} className="deals-underdog-card">
                  <span className="deals-underdog-card__score-badge">
                    Underdog {formatScore(p.underdogScore)}/10
                  </span>
                  <div className="deals-underdog-card__photo">
                    {p.headshot ? (
                      <img src={p.headshot} alt="" width={56} height={56} loading="lazy" />
                    ) : (
                      <span className="deals-underdog-card__ph">★</span>
                    )}
                  </div>
                  <div className="deals-underdog-card__body">
                    <p className="deals-underdog-card__name">{p.name}</p>
                    <p className="deals-underdog-card__team">{p.team}</p>
                    <p className="deals-underdog-card__meta">
                      {p.age != null ? `${p.age} ans` : "—"} ·{" "}
                      {p.ptsPerGame != null ? `${formatScore(p.ptsPerGame)} pts/match` : "—"}
                    </p>
                    <button
                      type="button"
                      className="deals-underdog-card__btn"
                      onClick={() => jumpToAnalyze(p.name)}
                    >
                      Analyser ses cartes →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          className="deals-section deals-section--momentum"
          aria-labelledby="deals-momentum-heading"
        >
          <h2 id="deals-momentum-heading" className="deals-section__title">
            📈 En ce moment
          </h2>
          <p className="deals-section__lede">
            Top 5 Card Scout (math) sur nos joueurs trending.
          </p>
          {momentumLoading ? (
            <div className="deals-momentum-scroll deals-momentum-scroll--loading">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`msk-${i}`} className="deals-momentum-skeleton" />
              ))}
            </div>
          ) : (
            <div className="deals-momentum-scroll">
              {momentumPlayers.map((p) => (
                <div key={p.id} className="deals-momentum-card">
                  <div className="deals-momentum-card__photo">
                    {p.headshotUrl ? (
                      <img src={p.headshotUrl} alt="" width={56} height={56} loading="lazy" />
                    ) : (
                      <span className="deals-momentum-card__ph">★</span>
                    )}
                  </div>
                  <div className="deals-momentum-card__body">
                    <p className="deals-momentum-card__name">{p.name}</p>
                    <p className="deals-momentum-card__score">
                      Score {p.score != null ? Number(p.score).toFixed(1) : "—"}/10
                    </p>
                    <button
                      type="button"
                      className="deals-momentum-card__btn"
                      onClick={() => jumpToAnalyze(p.name)}
                    >
                      Analyser →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
