"use client";

/* eslint-disable @next/next/no-img-element -- photos NHL officielles */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function formatScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return (Math.round(x * 10) / 10).toFixed(1);
}

function scoreTier(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "mid";
  if (s >= 7) return "high";
  if (s >= 5) return "mid";
  return "low";
}

function verdictTone(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "buy";
  if (v.includes("éviter") || v.includes("eviter")) return "avoid";
  return "watch";
}

function leagueVerdictTone(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "buy";
  if (v.includes("fort")) return "hot";
  return "watch";
}

function formatDateFr(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("fr-CA", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

function rankMedalClass(rank) {
  if (rank === 1) return "op-league-card--gold";
  if (rank === 2) return "op-league-card--silver";
  if (rank === 3) return "op-league-card--bronze";
  return "";
}

function priorityTone(priority) {
  const p = String(priority ?? "").toLowerCase();
  if (p.includes("haute")) return "high";
  if (p.includes("faible")) return "low";
  return "mid";
}

/**
 * @param {object} props
 * @param {object} props.opp
 * @param {() => void} props.onAnalyze
 */
function LeagueOpportunityCard({ opp, onAnalyze }) {
  const rank = Number(opp.rank) || 0;
  const vt = leagueVerdictTone(opp.verdict);
  const tier = scoreTier(opp.investmentScore);
  const recs = Array.isArray(opp.cardRecommendations)
    ? opp.cardRecommendations
    : [];

  return (
    <article className={`op-league-card ${rankMedalClass(rank)}`}>
      <div className="op-league-card__rank">#{rank}</div>
      <div className="op-league-card__hero">
        {opp.headshotUrl ? (
          <img
            className="op-league-card__img"
            src={opp.headshotUrl}
            alt=""
            loading="lazy"
          />
        ) : (
          <span className="op-league-card__ph" aria-hidden>
            ★
          </span>
        )}
        <div className="op-league-card__identity">
          <h3 className="op-league-card__name">{opp.playerName}</h3>
          <p className="op-league-card__meta">
            {opp.team}
            {opp.age != null ? ` · ${opp.age} ans` : ""}
            {opp.ptsPerGame != null ? ` · ${opp.ptsPerGame} pts/m` : ""}
          </p>
          <div className="op-league-card__scores">
            <span className={`op-league-card__score op-top-card__score--${tier}`}>
              {formatScore(opp.investmentScore)}/10
            </span>
            <span className={`op-league-card__verdict op-league-card__verdict--${vt}`}>
              {opp.verdict}
            </span>
          </div>
        </div>
      </div>

      {opp.headline ? (
        <p className="op-league-card__headline">{opp.headline}</p>
      ) : null}
      {opp.reasoning ? (
        <p className="op-league-card__reasoning">{opp.reasoning}</p>
      ) : null}

      {recs.length > 0 ? (
        <div className="op-league-card__recs">
          <p className="op-league-card__recs-title">Cartes recommandées</p>
          {recs.map((rec, i) => {
            const pt = priorityTone(rec.priority);
            return (
              <div key={`${rec.cardType}-${i}`} className="op-league-rec">
                <div className="op-league-rec__head">
                  <span className="op-league-rec__type">{rec.cardType}</span>
                  <span className={`op-league-rec__prio op-league-rec__prio--${pt}`}>
                    {rec.priority}
                  </span>
                </div>
                <div className="op-league-rec__stats">
                  <span className="op-league-rec__upside">{rec.expectedUpside}</span>
                  <span>{rec.timeline}</span>
                </div>
                <Link
                  className="op-league-rec__ebay"
                  href={`/deals?player=${encodeURIComponent(opp.playerName)}`}
                >
                  Trouver sur eBay →
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}

      {opp.risks ? (
        <p className="op-league-card__risks">⚠ {opp.risks}</p>
      ) : null}

      <button
        type="button"
        className="op-league-card__analyze"
        onClick={() => onAnalyze(opp)}
      >
        Deep dive joueur →
      </button>
    </article>
  );
}

/**
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.score
 * @param {string} props.comment
 */
function FactorCell({ label, score, comment }) {
  const tier = scoreTier(score);
  return (
    <div className="op-factor">
      <p className="op-factor__label">{label}</p>
      <p className={`op-factor__score op-dive__score--${tier}`}>
        {formatScore(score)}/10
      </p>
      <p className="op-factor__comment">{comment}</p>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.rec
 * @param {string} props.playerName
 */
function CardRecommendation({ rec, playerName }) {
  const pt = priorityTone(rec.priority);
  const dealsHref = `/deals?player=${encodeURIComponent(playerName)}`;

  return (
    <article className={`op-rec-card op-rec-card--${pt}`}>
      <div className="op-rec-card__head">
        <h4 className="op-rec-card__type">{rec.cardType}</h4>
        <span className={`op-rec-card__badge op-rec-card__badge--${pt}`}>
          {rec.priority}
        </span>
      </div>
      <p className="op-rec-card__text">{rec.reasoning}</p>
      <div className="op-rec-card__stats">
        <span>Timeline : {rec.expectedTimeline}</span>
        <span>Upside : {rec.expectedUpside}</span>
      </div>
      <Link className="op-rec-card__cta" href={dealsHref}>
        Trouver sur eBay →
      </Link>
    </article>
  );
}

/**
 * @param {object} props
 * @param {object} props.data
 */
function PlayerDeepDive({ data }) {
  const pa = data.playerAnalysis ?? {};
  const tier = scoreTier(data.investmentScore);
  const vt = verdictTone(data.verdict);
  const risks = Array.isArray(data.risks) ? data.risks : [];

  return (
    <div className="op-dive" aria-live="polite">
      <header className="op-dive__header">
        {data.headshotUrl ? (
          <img
            className="op-dive__photo"
            src={data.headshotUrl}
            alt=""
            width={88}
            height={88}
          />
        ) : null}
        <div className="op-dive__identity">
          <h3 className="op-dive__name">{data.playerName}</h3>
          <p className="op-dive__meta">
            {data.team}
            {data.age != null ? ` · ${data.age} ans` : ""}
            {data.position ? ` · ${data.position}` : ""}
          </p>
        </div>
        <div className="op-dive__score-block">
          <div className={`op-dive__score op-dive__score--${tier}`}>
            {formatScore(data.investmentScore)}
            <span style={{ fontSize: "1rem", opacity: 0.7 }}>/10</span>
          </div>
          <p className={`op-dive__verdict op-dive__verdict--${vt}`}>
            {data.verdict}
          </p>
        </div>
      </header>

      <section className="op-dive__section">
        <h4 className="op-dive__section-title">Analyse du joueur</h4>
        <div className="op-factors">
          <FactorCell label="Âge" score={pa.ageScore} comment={pa.ageComment} />
          <FactorCell
            label="Performance"
            score={pa.performanceScore}
            comment={pa.performanceComment}
          />
          <FactorCell
            label="Trajectoire"
            score={pa.trajectoryScore}
            comment={pa.trajectoryComment}
          />
          <FactorCell
            label="Franchise"
            score={pa.franchiseScore}
            comment={pa.franchiseComment}
          />
          <FactorCell
            label="Contrat"
            score={pa.contractScore}
            comment={pa.contractComment}
          />
          <FactorCell
            label="Marché"
            score={pa.marketScore}
            comment={pa.marketComment}
          />
        </div>
      </section>

      {data.cardRecommendations?.length ? (
        <section className="op-dive__section">
          <h4 className="op-dive__section-title">Cartes recommandées</h4>
          <div className="op-rec-grid">
            {data.cardRecommendations.map((rec, i) => (
              <CardRecommendation
                key={`${rec.cardType}-${i}`}
                rec={rec}
                playerName={data.playerName}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="op-dive__section">
        <h4 className="op-dive__section-title">Verdict final</h4>
        <p className="op-verdict-text">{data.verdictReasoning}</p>
        {risks.length ? (
          <div className="op-risks">
            {risks.map((r, i) => (
              <span key={i} className="op-risk-badge">
                ⚠ {r}
              </span>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function OpportunitesClient() {
  const [topLoading, setTopLoading] = useState(true);
  const [topError, setTopError] = useState(null);
  const [topOpportunities, setTopOpportunities] = useState([]);
  const [topLastUpdated, setTopLastUpdated] = useState(null);
  const [topAnalysisNote, setTopAnalysisNote] = useState("");
  const [topMocked, setTopMocked] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestItems, setSuggestItems] = useState([]);

  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [playerData, setPlayerData] = useState(null);

  const comboRef = useRef(null);
  const analyzeRef = useRef(null);
  const queryRef = useRef(query);
  const justSelectedRef = useRef(false);
  queryRef.current = query;

  useEffect(() => {
    let cancelled = false;
    setTopLoading(true);
    setTopError(null);
    fetch("/api/opportunites/top", { method: "GET" })
      .then((res) => res.json().then((json) => ({ res, json })))
      .then(({ res, json }) => {
        if (cancelled) return;
        if (!res.ok) {
          setTopError(json?.error ?? "Chargement impossible");
          setTopOpportunities([]);
          return;
        }
        setTopOpportunities(
          Array.isArray(json.opportunities) ? json.opportunities : []
        );
        setTopLastUpdated(json.lastUpdated ?? null);
        setTopAnalysisNote(json.analysisNote ?? "");
        setTopMocked(Boolean(json.mocked));
      })
      .catch(() => {
        if (!cancelled) {
          setTopError("Chargement impossible");
          setTopOpportunities([]);
        }
      })
      .finally(() => {
        if (!cancelled) setTopLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!comboRef.current?.contains(e.target)) setSuggestOpen(false);
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
        if (active && queryRef.current.trim() === captured) setSuggestItems([]);
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

  async function runPlayerAnalysis(playerId, playerName) {
    const id = String(playerId ?? "").trim();
    const name = String(playerName ?? query).trim();
    if (!id && !name) {
      setAnalyzeError("Choisis un joueur dans la liste.");
      return;
    }
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    setPlayerData(null);
    setSuggestOpen(false);

    try {
      let targetId = id;
      if (!targetId && name.length >= 2) {
        const searchRes = await fetch(
          `/api/player?q=${encodeURIComponent(name)}`,
          { method: "GET" }
        );
        const searchJson = await searchRes.json();
        const first = searchJson.results?.[0];
        if (first?.playerId) targetId = String(first.playerId);
      }
      if (!targetId) {
        setAnalyzeError("Joueur introuvable.");
        return;
      }

      const res = await fetch(
        `/api/opportunites/player?id=${encodeURIComponent(targetId)}&name=${encodeURIComponent(name)}`,
        { method: "GET" }
      );
      const json = await res.json();
      if (!res.ok) {
        setAnalyzeError(json?.error ?? "Analyse impossible");
        return;
      }
      setPlayerData(json);
      analyzeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setAnalyzeError("Impossible de contacter le serveur");
    } finally {
      setAnalyzeLoading(false);
    }
  }

  function pickPlayer(p) {
    const n = p?.name?.trim();
    if (!n || !p?.playerId) return;
    justSelectedRef.current = true;
    setSuggestOpen(false);
    setSuggestItems([]);
    setQuery(n);
    runPlayerAnalysis(p.playerId, n);
  }

  function handleTopAnalyze(card) {
    setQuery(card.playerName);
    runPlayerAnalysis(card.playerId, card.playerName);
  }

  function handleSubmit(e) {
    e.preventDefault();
    runPlayerAnalysis("", query);
  }

  return (
    <div className="op-page">
      <div className="op-shell">
        <nav className="op-nav" aria-label="Navigation">
          <Link href="/" className="op-nav__logo">
            Card <span>Scout</span>
          </Link>
          <Link href="/" className="op-nav__back">
            ← Accueil
          </Link>
        </nav>

        <header className="op-hero">
          <p className="op-hero__badge">
            <span aria-hidden>●</span> IA · Long terme
          </p>
          <h1 className="op-hero__title">Opportunités d&apos;investissement NHL</h1>
          <p className="op-hero__subtitle">
            L&apos;IA analyse le potentiel à long terme des cartes NHL : performance,
            trajectoire, cartes à cibler et verdict actionnable.
          </p>
        </header>

        <section className="op-section" aria-labelledby="op-top-heading">
          <div className="op-section__head">
            <h2 id="op-top-heading" className="op-section__title">
              🏆 Top Opportunités NHL
            </h2>
            <span className="op-section__badge">
              Mis à jour aux 2 semaines par Claude AI
            </span>
          </div>
          {topLastUpdated ? (
            <p className="op-section__updated">
              Dernière mise à jour : {formatDateFr(topLastUpdated)}
            </p>
          ) : null}
          {topAnalysisNote ? (
            <p className="op-section__lede">{topAnalysisNote}</p>
          ) : (
            <p className="op-section__lede">
              Analyse complète de la LNH : stats, âge et potentiel cartes sur 1–3
              saisons
              {topMocked ? " · démo sans clé Anthropic" : ""}.
            </p>
          )}

          {topLoading ? (
            <div className="op-league-grid" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={`top-sk-${i}`} className="op-skeleton op-skeleton--league" />
              ))}
            </div>
          ) : topError ? (
            <p className="op-empty">{topError}</p>
          ) : topOpportunities.length ? (
            <div className="op-league-grid">
              {topOpportunities.map((opp) => (
                <LeagueOpportunityCard
                  key={opp.playerId ?? opp.rank}
                  opp={opp}
                  onAnalyze={handleTopAnalyze}
                />
              ))}
            </div>
          ) : (
            <p className="op-empty">Aucune opportunité pour le moment.</p>
          )}
        </section>

        <section
          ref={analyzeRef}
          className="op-section"
          aria-labelledby="op-analyze-heading"
        >
          <h2 id="op-analyze-heading" className="op-section__title">
            🔍 Deep Dive — Analyser un joueur
          </h2>
          <p className="op-section__lede">
            Deep dive complet : facteurs, cartes recommandées et verdict final.
          </p>

          <div className="op-search">
            <form className="op-search__form" onSubmit={handleSubmit}>
              <div className="op-search__combo" ref={comboRef}>
                <input
                  className="op-search__input"
                  type="search"
                  autoComplete="off"
                  placeholder="Ex. Mitch Marner"
                  value={query}
                  onChange={(e) => {
                    justSelectedRef.current = false;
                    setQuery(e.target.value);
                  }}
                  onFocus={() => {
                    if (justSelectedRef.current) return;
                    if (query.trim().length >= 2) setSuggestOpen(true);
                  }}
                  aria-label="Nom du joueur"
                  aria-expanded={suggestOpen}
                />
                {suggestOpen && (suggestLoading || suggestItems.length > 0) ? (
                  <div className="op-search__suggest">
                    {suggestLoading ? (
                      <div className="op-empty" style={{ margin: 0, border: 0 }}>
                        Recherche…
                      </div>
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
              <button
                className="op-search__btn"
                type="submit"
                disabled={analyzeLoading}
              >
                {analyzeLoading ? "…" : "Analyser le potentiel"}
              </button>
            </form>
          </div>

          {analyzeError ? (
            <p className="op-alert" role="alert">
              {analyzeError}
            </p>
          ) : null}

          {analyzeLoading ? (
            <div aria-busy="true" aria-live="polite">
              <div className="op-loading-bar" />
              <div className="op-dive">
                <div className="op-dive__header">
                  <div
                    className="op-skeleton"
                    style={{ width: 88, height: 88, borderRadius: 14 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="op-skeleton op-skeleton--line" style={{ width: "60%" }} />
                    <div className="op-skeleton op-skeleton--line" style={{ width: "40%" }} />
                  </div>
                </div>
                <div className="op-dive__section">
                  <div className="op-factors">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={`f-sk-${i}`}
                        className="op-skeleton"
                        style={{ height: 88, borderRadius: 12 }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {!analyzeLoading && playerData ? (
            <PlayerDeepDive data={playerData} />
          ) : null}
        </section>
      </div>
    </div>
  );
}
