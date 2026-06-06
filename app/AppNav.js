"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import AuthButton from "@/app/AuthButton";

import "./app-nav.css";

/**
 * @param {{ active?: "deals" | "opportunites" | "analyse" | null }} props
 */
export default function AppNav({ active = null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const router = useRouter();

  function openSearch() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function closeSearch() {
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  async function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/player?q=${encodeURIComponent(q.trim())}`);
        const data = await r.json();
        const list = data?.results ?? data?.players ?? data ?? [];
        setResults(Array.isArray(list) ? list : []);
      } catch { setResults([]); }
      setLoading(false);
    }, 280);
  }

  function handleSelect(player) {
    closeSearch();
    const id = player.playerId ?? player.id;
    router.push(`/player/${id}`);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") closeSearch();
  }

  return (
    <>
      <nav className="cs-nav" aria-label="Navigation principale">
        <Link href="/" className="cs-nav__logo">
          Card <span>Scout</span>
        </Link>
        <div className="cs-nav__actions">
          {/* Search button */}
          <button
            type="button"
            className="cs-nav__search-btn"
            onClick={openSearch}
            aria-label="Rechercher un joueur"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span>Recherche</span>
          </button>

          <Link href="/deals" className={`cs-nav__btn${active === "deals" ? " cs-nav__btn--active" : ""}`}>
            Marché
          </Link>
          <Link href="/opportunites" className={`cs-nav__btn${active === "opportunites" ? " cs-nav__btn--active" : ""}`}>
            Opportunités
          </Link>
          <Link href="/analyse" className={`cs-nav__btn${active === "analyse" ? " cs-nav__btn--active" : ""}`}>
            Analyser
          </Link>
          <AuthButton />
        </div>
      </nav>

      {/* Search overlay */}
      {open && (
        <div className="cs-nav-search-overlay" role="dialog" aria-modal="true" aria-label="Recherche joueur">
          <div className="cs-nav-search-backdrop" onClick={closeSearch} aria-hidden />
          <div className="cs-nav-search-modal">
            <div className="cs-nav-search-field">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="cs-nav-search-icon">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="cs-nav-search-input"
                placeholder="Rechercher un joueur NHL…"
                value={query}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
              <button type="button" className="cs-nav-search-close" onClick={closeSearch} aria-label="Fermer">
                ESC
              </button>
            </div>
            {(results.length > 0 || loading) && (
              <ul className="cs-nav-search-results" role="listbox">
                {loading && results.length === 0 && (
                  <li className="cs-nav-search-status">Recherche…</li>
                )}
                {results.slice(0, 8).map((p) => (
                  <li key={p.playerId ?? p.id} role="option">
                    <button
                      type="button"
                      className="cs-nav-search-result"
                      onClick={() => handleSelect(p)}
                    >
                      {p.headshotUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.headshotUrl} alt="" width={36} height={36} className="cs-nav-search-avatar" />
                      )}
                      <div className="cs-nav-search-result-info">
                        <span className="cs-nav-search-result-name">{p.name ?? p.fullName}</span>
                        <span className="cs-nav-search-result-meta">
                          {p.team ?? p.teamName ?? p.currentTeamAbbrev ?? "—"} · {p.position ?? p.positionCode ?? "—"}
                        </span>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
