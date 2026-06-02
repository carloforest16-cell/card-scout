"use client";

/* eslint-disable @next/next/no-img-element -- miniatures eBay tierces */
import { useEffect, useMemo, useRef, useState } from "react";

import AppNav from "../AppNav";

/** @type {Array<{ id: string; label: string }>} */
const BUDGET_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "under5", label: "Moins de 5$" },
  { id: "5-20", label: "5-20$" },
  { id: "20-50", label: "20-50$" },
  { id: "50-100", label: "50-100$" },
  { id: "100plus", label: "100$+" },
];

const DEFAULT_HOTTEST_FILTERS = {
  minPrice: 10,
  maxPrice: 500,
  team: "all",
  cardType: "all",
  minScore: 8.0,
};

const NHL_TEAM_OPTIONS = [
  { id: "all", label: "Toutes" },
  { id: "ANA", label: "Anaheim Ducks" },
  { id: "BOS", label: "Boston Bruins" },
  { id: "BUF", label: "Buffalo Sabres" },
  { id: "CGY", label: "Calgary Flames" },
  { id: "CAR", label: "Carolina Hurricanes" },
  { id: "CHI", label: "Chicago Blackhawks" },
  { id: "COL", label: "Colorado Avalanche" },
  { id: "CBJ", label: "Columbus Blue Jackets" },
  { id: "DAL", label: "Dallas Stars" },
  { id: "DET", label: "Detroit Red Wings" },
  { id: "EDM", label: "Edmonton Oilers" },
  { id: "FLA", label: "Florida Panthers" },
  { id: "LAK", label: "Los Angeles Kings" },
  { id: "MIN", label: "Minnesota Wild" },
  { id: "MTL", label: "Montréal Canadiens" },
  { id: "NSH", label: "Nashville Predators" },
  { id: "NJD", label: "New Jersey Devils" },
  { id: "NYI", label: "New York Islanders" },
  { id: "NYR", label: "New York Rangers" },
  { id: "OTT", label: "Ottawa Senators" },
  { id: "PHI", label: "Philadelphia Flyers" },
  { id: "PIT", label: "Pittsburgh Penguins" },
  { id: "SJS", label: "San Jose Sharks" },
  { id: "SEA", label: "Seattle Kraken" },
  { id: "STL", label: "St. Louis Blues" },
  { id: "TBL", label: "Tampa Bay Lightning" },
  { id: "TOR", label: "Toronto Maple Leafs" },
  { id: "UTA", label: "Utah Mammoth" },
  { id: "VAN", label: "Vancouver Canucks" },
  { id: "VGK", label: "Vegas Golden Knights" },
  { id: "WSH", label: "Washington Capitals" },
  { id: "WPG", label: "Winnipeg Jets" },
];

const HOTTEST_CARD_TYPE_OPTIONS = [
  { id: "all", label: "Toutes" },
  { id: "young-guns", label: "Young Guns" },
  { id: "auto", label: "Auto/RPA" },
  { id: "canvas", label: "Canvas" },
  { id: "graded-psa", label: "Gradée PSA" },
  { id: "numbered", label: "Numéroté" },
  { id: "parallel", label: "Parallèle" },
];

const PLAYER_TEAM_BY_NAME = {
  "alex ovechkin": "WSH",
  "artemi panarin": "NYR",
  "auston matthews": "TOR",
  "brad marchand": "FLA",
  "brady tkachuk": "OTT",
  "claude giroux": "OTT",
  "cole caufield": "MTL",
  "cole perfetti": "WPG",
  "connor bedard": "CHI",
  "connor mcdavid": "EDM",
  "david pastrnak": "BOS",
  "ivan demidov": "MTL",
  "jack hughes": "NJD",
  "juraj slafkovsky": "MTL",
  "leon draisaitl": "EDM",
  "logan cooley": "UTA",
  "macklin celebrini": "SJS",
  "matvei michkov": "PHI",
  "matthew schaefer": "NYI",
  "matthew tkachuk": "FLA",
  "mitch marner": "TOR",
  "nathan mackinnon": "COL",
  "nick suzuki": "MTL",
  "nikita kucherov": "TBL",
  "quinton byfield": "LAK",
  "sam reinhart": "FLA",
  "sebastian aho": "CAR",
  "sidney crosby": "PIT",
  "tim stutzle": "OTT",
};

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

function normalizePlayerName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamMatchesPlayer(playerName, team) {
  if (team === "all") return true;
  return PLAYER_TEAM_BY_NAME[normalizePlayerName(playerName)] === team;
}

function cardTypeMatchesCard(groupType, filter) {
  if (filter === "all") return true;
  const g = String(groupType ?? "");
  switch (filter) {
    case "young-guns":
      return g.includes("Young Guns");
    case "auto":
      return g.includes("Auto");
    case "canvas":
      return g.includes("Canvas");
    case "graded-psa":
      return g.includes("Gradée PSA");
    case "numbered":
      return g.includes("Numéroté");
    case "parallel":
      return g.includes("Parallèle");
    default:
      return g === filter;
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

function buildSportsCardsProUrl(title, playerName) {
  const t = String(title ?? "");
  const keywords = [playerName].filter(Boolean);

  const yearMatch = t.match(/\b(20\d{2})/);
  if (yearMatch) keywords.push(yearMatch[1]);

  const cardNum = t.match(/#([A-Z0-9-]{1,8})\b/i);
  if (cardNum) keywords.push(cardNum[1]);

  const typeMap = {
    "Young Guns": "young guns",
    Allure: "allure",
    Canvas: "canvas",
    "Clear Cut": "clear cut",
    Artifacts: "artifacts",
    Trilogy: "trilogy",
    Credentials: "credentials",
    SPx: "spx",
    Premier: "premier",
    Retro: "retro",
    "Tim Hortons": "tim hortons",
    "Black Diamond": "black diamond",
    "The Cup": "the cup",
  };

  for (const [key, val] of Object.entries(typeMap)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(t)) {
      keywords.push(val);
      break;
    }
  }

  const q = keywords.join("+");
  return `https://www.sportscardspro.com/search-products?type=prices&q=${q}&go=Go`;
}

/**
 * @param {object} props
 * @param {object} props.d
 * @param {boolean} [props.showPlayerChip]
 */
function InvestmentListingCard({ d, showPlayerChip }) {
  const isPass = String(d.verdict).toLowerCase().includes("passer");
  const priceCheckUrl = buildSportsCardsProUrl(d.title, d.playerName);
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
          <span className="deal-card__price">{formatCad(d.price)}</span>
        </div>
        <a
          className="deal-card__cta deal-card__cta--outline"
          href={priceCheckUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Vérifier le prix réel →
        </a>
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

/**
 * @param {object} props
 */
function HottestDealsContent({
  hottestCardMode,
  setHottestCardMode,
  hottestLoading,
  hottestMocked,
  filters,
  setFilters,
  hottestLoadingCards,
  hottestError,
  hottestCards,
  filteredHottestCards,
  formatCad,
}) {
  return (
    <>
      <p className="deals-section__lede">
        Meilleures opportunités eBay parmi les stars NHL — cartes{" "}
        {hottestCardMode === "graded" ? "gradées" : "raw"} — mises à jour en
        arrière-plan.
        {hottestMocked ? " Démo sans clé eBay." : ""}
      </p>

      <div
        className="deals-card-mode deals-card-mode--hot"
        role="radiogroup"
        aria-label="Type de cartes — Hottest Deals"
      >
        <button
          type="button"
          role="radio"
          aria-checked={hottestCardMode === "raw"}
          className={`deals-card-mode__btn${hottestCardMode === "raw" ? " deals-card-mode__btn--active" : ""}`}
          onClick={() => setHottestCardMode("raw")}
          disabled={hottestLoading}
        >
          🃏 Cartes Raw
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={hottestCardMode === "graded"}
          className={`deals-card-mode__btn${hottestCardMode === "graded" ? " deals-card-mode__btn--active" : ""}`}
          onClick={() => setHottestCardMode("graded")}
          disabled={hottestLoading}
        >
          🏆 Cartes Gradées
        </button>
      </div>

      <div className="deals-hot-filters" aria-label="Filtres Hottest Deals">
        <div className="deals-hot-filter deals-hot-filter--price">
          <span className="deals-hot-filter__label">
            Prix {formatCad(filters.minPrice)} - {formatCad(filters.maxPrice)}
          </span>
          <div className="deals-hot-filter__ranges">
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={filters.minPrice}
              onChange={(e) => {
                const minPrice = Math.min(Number(e.target.value), filters.maxPrice);
                setFilters((prev) => ({ ...prev, minPrice }));
              }}
              aria-label="Prix minimum"
            />
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={filters.maxPrice}
              onChange={(e) => {
                const maxPrice = Math.max(Number(e.target.value), filters.minPrice);
                setFilters((prev) => ({ ...prev, maxPrice }));
              }}
              aria-label="Prix maximum"
            />
          </div>
        </div>

        <label className="deals-hot-filter">
          <span className="deals-hot-filter__label">Équipe</span>
          <select
            value={filters.team}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, team: e.target.value }))
            }
          >
            {NHL_TEAM_OPTIONS.map((team) => (
              <option key={team.id} value={team.id}>
                {team.label}
              </option>
            ))}
          </select>
        </label>

        <label className="deals-hot-filter">
          <span className="deals-hot-filter__label">Type</span>
          <select
            value={filters.cardType}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, cardType: e.target.value }))
            }
          >
            {HOTTEST_CARD_TYPE_OPTIONS.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="deals-hot-filter">
          <span className="deals-hot-filter__label">
            AI Score min {filters.minScore.toFixed(1)}
          </span>
          <input
            type="range"
            min="5"
            max="10"
            step="0.5"
            value={filters.minScore}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                minScore: Number(e.target.value),
              }))
            }
          />
        </label>

        <button
          type="button"
          className="deals-hot-filter__reset"
          onClick={() => setFilters(DEFAULT_HOTTEST_FILTERS)}
        >
          Réinitialiser
        </button>
      </div>

      {hottestLoadingCards ? (
        <div className="deal-cards-grid deal-cards-grid--hot" aria-busy="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={`sk-${i}`} className="deals-skeleton-card" />
          ))}
        </div>
      ) : hottestError ? (
        <p className="deals-empty">{hottestError}</p>
      ) : hottestCards?.length ? (
        filteredHottestCards.length ? (
          <div className="deal-cards-grid deal-cards-grid--hot">
            {filteredHottestCards.map((d) => (
              <InvestmentListingCard
                key={`hot-${d.playerId ?? "p"}-${d.listingIndex}-${d.title}`}
                d={d}
                showPlayerChip
              />
            ))}
          </div>
        ) : (
          <p className="deals-empty">
            Aucune carte ne correspond aux filtres Hottest Deals.
          </p>
        )
      ) : (
        <p className="deals-empty">Aucune opportunité eBay pour l&apos;instant.</p>
      )}
    </>
  );
}

export default function DealFinderClient() {
  const [query, setQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [hottestExpanded, setHottestExpanded] = useState(false);
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
  const [hottestCardMode, setHottestCardMode] = useState("raw");
  const [filters, setFilters] = useState(DEFAULT_HOTTEST_FILTERS);

  const comboRef = useRef(null);
  const queryRef = useRef(query);
  const justSelectedRef = useRef(false);
  const cardModeRef = useRef(cardMode);
  const analyzedPlayerRef = useRef(null);
  const hasAnalysisRef = useRef(false);
  queryRef.current = query;

  const availableListings = useMemo(() => {
    if (!data?.listings?.length) return [];
    return data.listings;
  }, [data]);

  const displayedListings = useMemo(() => {
    return availableListings.filter((d) => matchesBudget(d.price, budgetFilter));
  }, [availableListings, budgetFilter]);

  const filteredHottestCards = useMemo(() => {
    if (!hottestCards) return [];
    return hottestCards.filter((card) => {
      const price = Number(card.price);
      if (!Number.isFinite(price)) return false;
      if (price < filters.minPrice || price > filters.maxPrice) return false;
      if (
        filters.team !== "all" &&
        card.playerName &&
        !teamMatchesPlayer(card.playerName, filters.team)
      ) {
        return false;
      }
      if (!cardTypeMatchesCard(card.groupType, filters.cardType)) return false;
      if (Number(card.cardScoutScore) < filters.minScore) return false;
      return true;
    });
  }, [hottestCards, filters]);

  useEffect(() => {
    let cancelled = false;
    setHottestLoading(true);
    setHottestError(null);
    fetch(`/api/deals/hottest?mode=${encodeURIComponent(hottestCardMode)}`, {
      method: "GET",
    })
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
  }, [hottestCardMode]);

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
    if (hasSearched) return;

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
  }, [query, hasSearched]);

  async function runAnalyze(nameOverride, modeOverride) {
    const name = (nameOverride ?? query).trim();
    if (!name) {
      setError("Entre un nom de joueur.");
      return;
    }
    const mode = modeOverride ?? cardModeRef.current;
    setHasSearched(true);
    setHottestExpanded(false);
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

  function handleSearchFocus() {
    if (hasSearched) return;
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
    if (mode === cardModeRef.current) return;
    cardModeRef.current = mode;
    if (hasAnalysisRef.current && analyzedPlayerRef.current) {
      runAnalyze(analyzedPlayerRef.current, mode);
    }
    setCardMode(mode);
  }

  function resetSearch() {
    setHasSearched(false);
    setHottestExpanded(false);
    setQuery("");
    setData(null);
    setError(null);
    setLoading(false);
    setLoadingPlayer("");
    setBudgetFilter("all");
    setSuggestOpen(false);
    setSuggestItems([]);
    analyzedPlayerRef.current = null;
    hasAnalysisRef.current = false;
  }

  function handlePlayerNameClick() {
    if (hasSearched && query.trim()) {
      resetSearch();
    }
  }

  return (
    <div className="deals-page">
      <div className="deals-shell">
        <div className="cs-nav-wrap">
          <AppNav active="deals" />
        </div>

        <header className="deals-hero">
          <p className="deals-hero__badge">
            <span aria-hidden="true">●</span> IA + eBay
          </p>
          <h1 className="deals-hero__title">Marché des Cartes</h1>
          <p className="deals-hero__subtitle">
            Scores d&apos;investissement, médianes par segment et liens directs vers eBay.
          </p>
        </header>

        <section
          className="deals-section deals-section--search"
          aria-label="Recherche joueur"
        >
          <div className="deals-search deals-search--compact">
            <form className="deals-search__form" onSubmit={handleSubmit}>
              <div className="deals-search__combo" ref={comboRef}>
                <input
                  className={`deals-search__input${hasSearched && query.trim() ? " deals-search__input--player" : ""}`}
                  type="search"
                  autoComplete="off"
                  placeholder="Ex. Cole Caufield"
                  value={query}
                  onChange={(e) => {
                    if (hasSearched) return;
                    justSelectedRef.current = false;
                    setQuery(e.target.value);
                  }}
                  onClick={handlePlayerNameClick}
                  onFocus={handleSearchFocus}
                  onKeyDown={handleSearchKeyDown}
                  readOnly={hasSearched && Boolean(query.trim())}
                  aria-label="Nom du joueur"
                  aria-controls="deals-suggest-list"
                  aria-expanded={suggestOpen}
                  title={
                    hasSearched && query.trim()
                      ? "Cliquer pour une nouvelle recherche"
                      : undefined
                  }
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
              {hasSearched ? (
                <button
                  type="button"
                  className="deals-search__reset"
                  onClick={resetSearch}
                >
                  Nouvelle recherche
                </button>
              ) : null}
            </form>

            {hasSearched ? (
              <div
                className="deals-search-filters"
                aria-label="Filtres de recherche"
              >
                <div
                  className="deals-card-mode deals-card-mode--results"
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
                {availableListings.length > 0 ? (
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
                ) : null}
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="deals-alert" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        {hasSearched ? (
          <section
            className="deals-section deals-section--results"
            aria-labelledby="deals-results-heading"
          >
            <h2 id="deals-results-heading" className="deals-section__title">
              Résultats
              {query.trim() ? ` — ${query.trim()}` : ""}
            </h2>

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
                    <strong>{displayedListings.length}</strong> meilleure
                    {displayedListings.length > 1 ? "s" : ""} annonce
                    {displayedListings.length > 1 ? "s" : ""} disponible
                    {displayedListings.length > 1 ? "s" : ""} pour{" "}
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
                  {availableListings.length > 0
                    ? "Aucune annonce dans ce budget pour le moment."
                    : "Aucune annonce exploitable trouvée pour ce joueur en ce moment"}
                </p>
              )
            ) : null}
          </section>
        ) : null}

        {!hasSearched ? (
          <section
            className="deals-section deals-section--hot deals-section--hot-hero"
            aria-labelledby="deals-hot-heading"
          >
            <div className="deals-section--hot__inner">
              <h2 id="deals-hot-heading" className="deals-section__title">
                🔥 Hottest Deals
              </h2>
              <HottestDealsContent
                hottestCardMode={hottestCardMode}
                setHottestCardMode={setHottestCardMode}
                hottestLoading={hottestLoading}
                hottestMocked={hottestMocked}
                filters={filters}
                setFilters={setFilters}
                hottestLoadingCards={hottestLoading}
                hottestError={hottestError}
                hottestCards={hottestCards}
                filteredHottestCards={filteredHottestCards}
                formatCad={formatCad}
              />
            </div>
          </section>
        ) : (
          <section
            className={`deals-section deals-section--hot deals-section--hot-compact${hottestExpanded ? " deals-section--hot-compact--open" : ""}`}
            aria-labelledby="deals-hot-compact-heading"
          >
            <button
              type="button"
              id="deals-hot-compact-heading"
              className="deals-hot-compact__toggle"
              aria-expanded={hottestExpanded}
              onClick={() => setHottestExpanded((v) => !v)}
            >
              <span className="deals-hot-compact__label">🔥 Hottest Deals</span>
              <span
                className={`deals-hot-compact__chevron${hottestExpanded ? " deals-hot-compact__chevron--open" : ""}`}
                aria-hidden
              >
                ▼
              </span>
            </button>
            {hottestExpanded ? (
              <div className="deals-section--hot__inner deals-section--hot__inner--compact">
                <HottestDealsContent
                  hottestCardMode={hottestCardMode}
                  setHottestCardMode={setHottestCardMode}
                  hottestLoading={hottestLoading}
                  hottestMocked={hottestMocked}
                  filters={filters}
                  setFilters={setFilters}
                  hottestLoadingCards={hottestLoading}
                  hottestError={hottestError}
                  hottestCards={hottestCards}
                  filteredHottestCards={filteredHottestCards}
                  formatCad={formatCad}
                />
              </div>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}
