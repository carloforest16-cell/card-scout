"use client";

/* eslint-disable @next/next/no-img-element -- miniatures eBay tierces */
import { useEffect, useMemo, useRef, useState } from "react";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";
import TiltCard from "../components/TiltCard";

/** @type {Array<{ id: string; label: string }>} */
const BUDGET_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "under5", label: "< 5$" },
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
  minScore: 5.0,
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

const SCORE_MIN_OPTIONS = [5, 6, 7, 8];

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

function verdictBadgeClass(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "cn-badge--profit";
  if (v.includes("passer") || v.includes("éviter") || v.includes("eviter"))
    return "cn-badge--loss";
  return "cn-badge--gold";
}

/**
 * @param {object} props
 * @param {object} props.d
 * @param {boolean} [props.showPlayerChip]
 * @param {number} [props.index]
 */
function DealCard({ d, showPlayerChip, index = 0 }) {
  const score = Number(d.investmentScore);
  const isHigh = Number.isFinite(score) && score >= 7;

  return (
    <Reveal index={index}>
      <TiltCard className="dl-card-tilt">
        <article className="cn-card dl-card">
          <div className="dl-card__media">
            {showPlayerChip && d.playerName ? (
              d.playerId ? (
                <a className="dl-card__chip" href={`/player/${d.playerId}`}>
                  {d.playerName}
                </a>
              ) : (
                <span className="dl-card__chip">{d.playerName}</span>
              )
            ) : null}
            <span
              className={`dl-card__score cn-mono${isHigh ? " dl-card__score--high" : ""}`}
            >
              {formatScore(d.investmentScore)}
              <span className="dl-card__score-denom">/10</span>
            </span>
            {d.url ? (
              <a
                className="dl-card__media-link"
                href={d.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                aria-label={`eBay — ${String(d.title).slice(0, 80)}`}
              >
                {d.imageUrl ? (
                  <img src={d.imageUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="dl-card__ph" aria-hidden>
                    ◆
                  </span>
                )}
              </a>
            ) : d.imageUrl ? (
              <span className="dl-card__media-link">
                <img src={d.imageUrl} alt="" loading="lazy" decoding="async" />
              </span>
            ) : (
              <span className="dl-card__ph" aria-hidden>
                ◆
              </span>
            )}
          </div>

          <div className="dl-card__body">
            <span className={`cn-badge ${verdictBadgeClass(d.verdict)}`}>
              <span className="cn-badge__dot" aria-hidden />
              {d.verdict}
            </span>

            {d.groupDisplayName ? (
              <p className="dl-card__group cn-label">{d.groupDisplayName}</p>
            ) : null}

            <h3 className="dl-card__title">{d.title}</h3>

            <p className="dl-card__meta cn-mono">
              <span>HOLD · {d.holdTimeline || "—"}</span>
              <span className="dl-card__meta-dot" aria-hidden>
                ·
              </span>
              <span>UPSIDE · {d.upside || "—"}</span>
            </p>

            {d.reason ? <p className="dl-card__reason">{d.reason}</p> : null}

            <div className="dl-card__price-row">
              <span className="dl-card__price">{formatCad(d.price)}</span>
            </div>

            <div className="dl-card__links">
              {d.url ? (
                <a
                  className="dl-link"
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                >
                  Voir sur eBay
                  <span className="dl-link__arrow" aria-hidden>
                    →
                  </span>
                </a>
              ) : null}
            </div>
          </div>
        </article>
      </TiltCard>
    </Reveal>
  );
}

function DealSkeletonGrid({ count = 9 }) {
  return (
    <div className="dl-grid" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={`dl-sk-${i}`} className="dl-skel" />
      ))}
    </div>
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const playerParam = params.get("player")?.trim();
    if (playerParam) {
      setQuery(playerParam);
      runAnalyze(playerParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const cs = Number(card.cardScoutScore);
      if (Number.isFinite(cs) && cs < filters.minScore) return false;
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
        const res = await fetch(`/api/player?q=${encodeURIComponent(captured)}`, {
          method: "GET",
        });
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

  const hottestFilters = (
    <div className="dl-filters" aria-label="Filtres Hottest Deals">
      <div className="dl-filter">
        <span className="cn-label">Type</span>
        <div className="dl-pills" role="group" aria-label="Type de carte">
          {HOTTEST_CARD_TYPE_OPTIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`dl-pill${filters.cardType === t.id ? " dl-pill--active" : ""}`}
              aria-pressed={filters.cardType === t.id}
              onClick={() =>
                setFilters((prev) => ({ ...prev, cardType: t.id }))
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dl-filter dl-filter--row">
        <label className="dl-filter__inline">
          <span className="cn-label">Équipe</span>
          <select
            className="dl-select cn-mono"
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

        <div className="dl-filter__inline">
          <span className="cn-label">Score min</span>
          <div className="dl-pills" role="group" aria-label="Score minimum">
            {SCORE_MIN_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`dl-pill dl-pill--mono${filters.minScore === s ? " dl-pill--active" : ""}`}
                aria-pressed={filters.minScore === s}
                onClick={() => setFilters((prev) => ({ ...prev, minScore: s }))}
              >
                {s}+
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="dl-filter__reset"
          onClick={() => setFilters(DEFAULT_HOTTEST_FILTERS)}
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );

  const hottestGrid = hottestLoading ? (
    <DealSkeletonGrid count={9} />
  ) : hottestError ? (
    <p className="dl-empty">{hottestError}</p>
  ) : hottestCards?.length ? (
    filteredHottestCards.length ? (
      <div className="dl-grid">
        {filteredHottestCards.map((d, i) => (
          <DealCard
            key={`hot-${i}-${d.playerId ?? "p"}-${d.listingIndex}`}
            d={d}
            showPlayerChip
            index={i}
          />
        ))}
      </div>
    ) : (
      <p className="dl-empty">Aucune carte ne correspond aux filtres.</p>
    )
  ) : (
    <p className="dl-empty">Aucune opportunité eBay pour l&apos;instant.</p>
  );

  return (
    <div className="dl-page cinematic">
      <ScrollProgress />
      <Atmosphere />

      <div className="dl-rail">
        <div className="dl-rail__inner">
          <AppNav active="deals" />
        </div>
      </div>

      <main className="dl-main">
        {/* ── HERO ── */}
        <Reveal as="header" className="dl-hero">
          <p className="cn-eyebrow dl-hero__eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            INTELLIGENCE · EBAY · TEMPS RÉEL
          </p>
          <h1 className="cn-h1 dl-hero__title">
            DEAL <span className="cn-h1__ice">FINDER</span>
          </h1>

          <form onSubmit={handleSubmit} className="dl-search">
            <div className="dl-search__field" ref={comboRef}>
              <svg
                className="dl-search__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                className="dl-search__input"
                type="search"
                autoComplete="off"
                placeholder="Rechercher un joueur — ex. Cole Caufield"
                value={query}
                onChange={(e) => {
                  if (hasSearched) return;
                  justSelectedRef.current = false;
                  setQuery(e.target.value);
                }}
                onClick={() => {
                  if (hasSearched && query.trim()) resetSearch();
                }}
                onFocus={handleSearchFocus}
                onKeyDown={handleSearchKeyDown}
                readOnly={hasSearched && Boolean(query.trim())}
                role="combobox"
                aria-label="Nom du joueur"
                aria-autocomplete="list"
                aria-controls="dl-suggest-list"
                aria-expanded={suggestOpen}
                title={
                  hasSearched && query.trim()
                    ? "Cliquer pour une nouvelle recherche"
                    : undefined
                }
              />
              <button
                className="dl-search__btn"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="cn-btn__spin" aria-hidden />
                    ANALYSE
                  </>
                ) : (
                  <>ANALYSER →</>
                )}
              </button>

              {!hasSearched &&
              suggestOpen &&
              (suggestLoading || suggestItems.length > 0) ? (
                <div className="dl-suggest" id="dl-suggest-list" role="listbox">
                  {suggestLoading ? (
                    <div className="dl-suggest__status">Recherche…</div>
                  ) : (
                    suggestItems.map((p) => (
                      <button
                        key={p.playerId ?? p.name}
                        type="button"
                        className="dl-suggest__item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickPlayer(p)}
                      >
                        <span>{p.name}</span>
                        {p.team ? (
                          <span className="dl-suggest__team cn-mono">{p.team}</span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="dl-modes" role="radiogroup" aria-label="Type de cartes">
              <button
                type="button"
                role="radio"
                aria-checked={cardMode === "raw"}
                className={`dl-mode${cardMode === "raw" ? " dl-mode--active" : ""}`}
                onClick={() => handleCardModeChange("raw")}
              >
                Raw
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={cardMode === "graded"}
                className={`dl-mode${cardMode === "graded" ? " dl-mode--active" : ""}`}
                onClick={() => handleCardModeChange("graded")}
              >
                Gradée
              </button>
            </div>

            {hasSearched ? (
              <button
                type="button"
                className="dl-reset"
                onClick={resetSearch}
              >
                Nouvelle recherche
              </button>
            ) : null}
          </form>

          {error ? (
            <div className="dl-error" role="alert">
              <span aria-hidden>⨯</span>
              <span>{error}</span>
            </div>
          ) : null}
        </Reveal>

        {/* ── SEARCH RESULTS ── */}
        {hasSearched ? (
          <section className="dl-section" aria-labelledby="dl-results-heading">
            <div className="dl-section__head">
              <h2 id="dl-results-heading" className="cn-h2">
                {query.trim() ? query.trim() : "Résultats"}
              </h2>
              {availableListings.length > 0 ? (
                <div className="dl-pills" role="group" aria-label="Budget">
                  {BUDGET_FILTERS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className={`dl-pill dl-pill--mono${budgetFilter === b.id ? " dl-pill--active" : ""}`}
                      aria-pressed={budgetFilter === b.id}
                      onClick={() => setBudgetFilter(b.id)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {loading ? (
              <>
                <p className="dl-loading-text cn-mono">
                  → L&apos;IA analyse les cartes de{" "}
                  {loadingPlayer || query.trim()}…
                </p>
                <DealSkeletonGrid count={6} />
              </>
            ) : data ? (
              displayedListings.length > 0 ? (
                <>
                  <p className="dl-strip cn-mono">
                    {displayedListings.length} ANNONCE
                    {displayedListings.length > 1 ? "S" : ""}
                    {budgetFilter !== "all" ? " · BUDGET FILTRÉ" : ""}
                    {data.mocked ? " · DÉMO" : ""}
                    {data.claudeUsed ? " · CLAUDE" : ""}
                  </p>
                  <div className="dl-grid">
                    {displayedListings.map((d, i) => (
                      <DealCard
                        key={`${d.listingIndex}-${d.title}-${d.price}`}
                        d={d}
                        index={i}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="dl-empty">
                  {availableListings.length > 0
                    ? "Aucune annonce dans ce budget pour le moment."
                    : "Aucune annonce exploitable trouvée pour ce joueur."}
                </p>
              )
            ) : null}
          </section>
        ) : null}

        {/* ── HOTTEST DEALS ── */}
        {!hasSearched ? (
          <section className="dl-section" aria-labelledby="dl-hot-heading">
            <div className="dl-section__head">
              <div>
                <p className="cn-eyebrow">
                  <span className="cn-eyebrow__dot" aria-hidden />
                  STARS NHL · {hottestCardMode === "graded" ? "GRADÉES" : "RAW"}
                  {hottestMocked ? " · DÉMO" : ""}
                </p>
                <h2 id="dl-hot-heading" className="cn-h2">
                  HOTTEST <span className="cn-h1__ice">DEALS</span>
                </h2>
              </div>
              <div
                className="dl-modes"
                role="radiogroup"
                aria-label="Type de cartes — Hottest Deals"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={hottestCardMode === "raw"}
                  className={`dl-mode${hottestCardMode === "raw" ? " dl-mode--active" : ""}`}
                  onClick={() => setHottestCardMode("raw")}
                  disabled={hottestLoading}
                >
                  Raw
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={hottestCardMode === "graded"}
                  className={`dl-mode${hottestCardMode === "graded" ? " dl-mode--active" : ""}`}
                  onClick={() => setHottestCardMode("graded")}
                  disabled={hottestLoading}
                >
                  Gradée
                </button>
              </div>
            </div>

            {hottestFilters}
            {hottestGrid}
          </section>
        ) : (
          <section className="dl-section" aria-labelledby="dl-hot-compact-heading">
            <button
              type="button"
              id="dl-hot-compact-heading"
              className="dl-collapse"
              aria-expanded={hottestExpanded}
              onClick={() => setHottestExpanded((v) => !v)}
            >
              <span className="dl-collapse__label">
                <span className="cn-eyebrow__dot" aria-hidden />
                HOTTEST DEALS
              </span>
              <span
                className={`dl-collapse__chevron${hottestExpanded ? " dl-collapse__chevron--open" : ""}`}
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="16"
                  height="16"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>
            {hottestExpanded ? (
              <div className="dl-collapse__body">
                {hottestFilters}
                {hottestGrid}
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
