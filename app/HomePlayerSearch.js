"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function HomePlayerSearch({ compact = false, premium = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestItems, setSuggestItems] = useState([]);

  const comboRef = useRef(null);
  const queryRef = useRef(query);
  queryRef.current = query;

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
        const data = await res.json();
        if (!active || queryRef.current.trim() !== captured) return;
        if (!res.ok) {
          setSuggestItems([]);
        } else {
          setSuggestItems(Array.isArray(data.results) ? data.results : []);
        }
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

  async function handleSubmit(e) {
    e.preventDefault();
    setSuggestOpen(false);
    const q = query.trim();
    if (!q) {
      setError(null);
      setResults(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/player?q=${encodeURIComponent(q)}`,
        { method: "GET" }
      );
      let data = null;
      try {
        data = await res.json();
      } catch {
        setError("Réponse invalide du serveur");
        setResults(null);
        return;
      }

      if (!res.ok) {
        setError(data?.error ?? "Une erreur est survenue");
        setResults(null);
        return;
      }

      setResults(Array.isArray(data.results) ? data.results : []);
    } catch {
      setError("Impossible de contacter le serveur");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  const showEmpty =
    !loading && results !== null && Array.isArray(results) && results.length === 0;

  const showCards =
    !loading && results !== null && Array.isArray(results) && results.length > 0;

  const qTrim = query.trim();
  const showSuggestPanel = suggestOpen && qTrim.length >= 2;

  return (
    <div
      className={[
        "home-search",
        compact ? "home-search--compact" : "",
        premium ? "home-search--premium" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <form
        className={[
          compact ? "home__form home__form--integrated" : "home__form",
          premium && compact ? "hp-form-premium" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onSubmit={handleSubmit}
        role="search"
        aria-busy={loading}
      >
        <div
          className={
            compact ? "home-search__combo home-search__combo--integrated" : "home-search__combo"
          }
          ref={comboRef}
        >
          <label htmlFor="player-search" className="visually-hidden">
            Nom du joueur
          </label>
          <input
            id="player-search"
            className={`${compact ? "home__input home__input--integrated" : "home__input"}${premium && compact ? " hp-input-premium" : ""}`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (query.trim().length >= 2) {
                setSuggestOpen(true);
              }
            }}
            placeholder="Nom du joueur (ex. Connor McDavid)"
            autoComplete="off"
            enterKeyHint="search"
            disabled={loading}
            aria-expanded={showSuggestPanel}
            aria-controls="player-suggest-list"
            aria-haspopup="true"
          />
          {showSuggestPanel ? (
            <div
              id="player-suggest-list"
            className={["home-search__dropdown", premium ? "hp-dropdown-premium" : ""]
              .filter(Boolean)
              .join(" ")}
              role="region"
              aria-label="Suggestions de joueurs"
              aria-busy={suggestLoading}
            >
              {suggestLoading ? (
                <p className="home-search__dropdown-status">Recherche…</p>
              ) : suggestItems.length === 0 ? (
                <p className="home-search__dropdown-status">Aucun joueur trouvé</p>
              ) : (
                <ul className="home-search__suggest-list">
                  {suggestItems.map((player, index) => {
                    const key = `${player.playerId ?? "np"}-${player.name}-${index}`;
                    const team = player.team ?? "—";
                    const pos = player.position ?? "—";
                    const row = (
                      <>
                        <span className="home-search__suggest-name">{player.name}</span>
                        <span className="home-search__suggest-meta">
                          <span className="home-search__suggest-team">{team}</span>
                          <span className="home-search__suggest-sep" aria-hidden="true">
                            ·
                          </span>
                          <span className="home-search__suggest-pos">{pos}</span>
                        </span>
                      </>
                    );
                    if (player.playerId) {
                      return (
                        <li key={key} className="home-search__suggest-item">
                          <Link
                            href={`/player/${player.playerId}`}
                            className="home-search__suggest-link"
                            onClick={() => setSuggestOpen(false)}
                          >
                            {row}
                          </Link>
                        </li>
                      );
                    }
                    return (
                      <li
                        key={key}
                        className="home-search__suggest-item home-search__suggest-item--disabled"
                        aria-disabled="true"
                      >
                        <span className="home-search__suggest-link home-search__suggest-link--static">
                          {row}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
        {compact ? (
          <button
            className={`home__button home__button--integrated${premium ? " hp-btn-search-premium" : ""}`}
            type="submit"
            disabled={loading}
            aria-label={loading ? "Recherche en cours" : "Rechercher"}
          >
            {loading ? (
              <span className="home__button-integrated-dot" aria-hidden="true" />
            ) : (
              <svg
                className="home__button-integrated-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M16 16l5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        ) : (
          <button className="home__button" type="submit" disabled={loading}>
            {loading ? "Recherche…" : "Rechercher"}
          </button>
        )}
      </form>

      <div className="home-results" aria-live="polite">
        {error ? (
          <p className="home-results__error" role="alert">
            {error}
          </p>
        ) : null}

        {showEmpty ? (
          <p className="home-results__empty">Aucun joueur trouvé</p>
        ) : null}

        {showCards ? (
          <ul className="home-results__grid">
            {results.map((player, index) => {
              const key = `${player.playerId ?? "np"}-${player.name}-${index}`;
              const body = (
                <>
                  <p className="home-card__name">{player.name}</p>
                  <dl className="home-card__meta">
                    <div className="home-card__row">
                      <dt>Équipe</dt>
                      <dd>{player.team ?? "—"}</dd>
                    </div>
                    <div className="home-card__row">
                      <dt>Position</dt>
                      <dd>{player.position ?? "—"}</dd>
                    </div>
                  </dl>
                </>
              );

              if (player.playerId) {
                return (
                  <li key={key} className="home-card-item">
                    <Link
                      href={`/player/${player.playerId}`}
                      className="home-card home-card--interactive"
                    >
                      {body}
                    </Link>
                  </li>
                );
              }

              return (
                <li key={key} className="home-card-item">
                  <div className="home-card">{body}</div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
