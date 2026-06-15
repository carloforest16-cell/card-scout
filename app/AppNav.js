"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Search, Store, Target, ScanLine, User, Activity, Mail, Award, BarChart2, Gavel } from "lucide-react";

import AuthButton from "@/app/AuthButton";

import "./app-nav.css";

const NAV_ITEMS = [
  { key: "search", label: "Recherche", Icon: Search, gradient: "linear-gradient(135deg, #00d4ff, #0070f3)" },
  { key: "deals", label: "Marché", href: "/deals", Icon: Store, gradient: "linear-gradient(135deg, #ff1744, #ff6d00)" },
  { key: "encheres", label: "Enchères", href: "/encheres", Icon: Gavel, gradient: "linear-gradient(135deg, #ef4444, #f97316)" },
  { key: "opportunites", label: "Opportunités", href: "/opportunites", Icon: Target, gradient: "linear-gradient(135deg, #ffab00, #ff6d00)" },
  { key: "analyse", label: "Analyser", href: "/analyse", Icon: ScanLine, gradient: "linear-gradient(135deg, #aa00ff, #7c4dff)" },
  { key: "pulse", label: "Pulse", href: "/pulse", Icon: Activity, gradient: "linear-gradient(135deg, #f97316, #ef4444)" },
  { key: "picks",   label: "Picks",   href: "/picks",   Icon: Mail,  gradient: "linear-gradient(135deg, #a78bfa, #7c3aed)" },
  { key: "grading",   label: "Grading",   href: "/grading",   Icon: Award,     gradient: "linear-gradient(135deg, #fbbf24, #f97316)" },
  { key: "portfolio", label: "Vault",     href: "/portfolio", Icon: BarChart2,  gradient: "linear-gradient(135deg, #10b981, #0ea5e9)" },
];

/**
 * @param {{ active?: "deals" | "opportunites" | "analyse" | null }} props
 */
const RECENT_KEY = "cs_recent_searches";
const MAX_RECENT = 5;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}

function saveRecent(player) {
  try {
    const entry = { id: player.playerId ?? player.id, name: player.name ?? player.fullName, headshotUrl: player.headshotUrl ?? null, team: player.team ?? player.teamName ?? player.currentTeamAbbrev ?? null };
    const prev = loadRecent().filter((r) => String(r.id) !== String(entry.id));
    localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...prev].slice(0, MAX_RECENT)));
  } catch { /* safari private */ }
}

export default function AppNav({ active = null }) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState([]);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const router = useRouter();

  function openSearch() {
    setMenuOpen(false);
    setRecent(loadRecent());
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
    saveRecent(player);
    closeSearch();
    const id = player.playerId ?? player.id;
    router.push(`/player/${id}`);
  }

  function handleSelectRecent(entry) {
    closeSearch();
    router.push(`/player/${entry.id}`);
  }

  function clearRecent() {
    try { localStorage.removeItem(RECENT_KEY); } catch { /* */ }
    setRecent([]);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") closeSearch();
  }

  return (
    <>
      <nav className="cs-nav" aria-label="Navigation principale">
        <Link href="/" className="cs-nav__logo" onClick={() => setMenuOpen(false)}>
          Card <span>Scout</span>
        </Link>

        {/* Hamburger — mobile only */}
        <button
          type="button"
          className={`cs-nav__burger${menuOpen ? " cs-nav__burger--open" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={menuOpen}
        >
          <span /><span /><span />
        </button>

        {/* Gradient pill menu — centered */}
        <div className={`cs-nav__pills${menuOpen ? " cs-nav__pills--open" : ""}`}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.Icon;
            const isActive = item.key === active;

            if (item.key === "search") {
              return (
                <button
                  key={item.key}
                  type="button"
                  className="cs-nav__pill"
                  onClick={openSearch}
                  aria-label="Rechercher un joueur"
                  style={{ "--pill-gradient": item.gradient }}
                >
                  <span className="cs-nav__pill-bg" />
                  <Icon className="cs-nav__pill-icon" size={20} strokeWidth={2.2} />
                  <span className="cs-nav__pill-label">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`cs-nav__pill${isActive ? " cs-nav__pill--active" : ""}`}
                onClick={() => setMenuOpen(false)}
                style={{ "--pill-gradient": item.gradient }}
              >
                <span className="cs-nav__pill-bg" />
                <Icon className="cs-nav__pill-icon" size={20} strokeWidth={2.2} />
                <span className="cs-nav__pill-label">{item.label}</span>
              </Link>
            );
          })}

          {/* AuthButton inside pills on mobile only (rendered via CSS) */}
          <div className="cs-nav__pills-auth">
            <AuthButton />
          </div>
        </div>

        {/* AuthButton on right — desktop only */}
        <div className="cs-nav__auth">
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
            {query.trim().length < 2 && recent.length > 0 && (
              <div className="cs-nav-search-recent">
                <div className="cs-nav-search-recent-header">
                  <span className="cs-nav-search-recent-label">Recherches récentes</span>
                  <button type="button" className="cs-nav-search-recent-clear" onClick={clearRecent}>Effacer</button>
                </div>
                <ul className="cs-nav-search-results" role="listbox">
                  {recent.map((entry) => (
                    <li key={entry.id} role="option" aria-selected={false}>
                      <button type="button" className="cs-nav-search-result" onClick={() => handleSelectRecent(entry)}>
                        {entry.headshotUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={entry.headshotUrl} alt="" width={36} height={36} className="cs-nav-search-avatar" />
                        ) : (
                          <span className="cs-nav-search-avatar cs-nav-search-avatar--ph" aria-hidden>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                          </span>
                        )}
                        <div className="cs-nav-search-result-info">
                          <span className="cs-nav-search-result-name">{entry.name}</span>
                          {entry.team && <span className="cs-nav-search-result-meta">{entry.team}</span>}
                        </div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="cs-nav-search-recent-icon">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                          <path d="M3 3v5h5"/>
                          <path d="M12 7v5l3 3"/>
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(results.length > 0 || loading) && (
              <ul className="cs-nav-search-results" role="listbox">
                {loading && results.length === 0 && (
                  <li className="cs-nav-search-status">Recherche…</li>
                )}
                {results.slice(0, 8).map((p) => (
                  <li key={p.playerId ?? p.id} role="option" aria-selected={false}>
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
