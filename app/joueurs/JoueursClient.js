"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import "./joueurs.css";

const LIMIT = 25;

const NHL_TEAMS = [
  "ANA","ARI","BOS","BUF","CAR","CBJ","CGY","CHI","COL","DAL",
  "DET","EDM","FLA","LAK","MIN","MTL","NJD","NSH","NYI","NYR",
  "OTT","PHI","PIT","SEA","SJS","STL","TBL","TOR","UTA","VAN","VGK","WPG","WSH",
];

const POSITIONS = [
  { code: "C",  label: "Centre" },
  { code: "L",  label: "Ailier gauche" },
  { code: "R",  label: "Ailier droit" },
  { code: "D",  label: "Défenseur" },
  { code: "G",  label: "Gardien" },
];

const SORT_OPTIONS = [
  { key: "score",  label: "Score" },
  { key: "points", label: "Pts" },
  { key: "name",   label: "Nom" },
  { key: "age",    label: "Âge" },
];

function tierClass(tier) {
  switch ((tier ?? "").toLowerCase()) {
    case "elite":  return "jr-card__score--elite";
    case "strong": return "jr-card__score--strong";
    case "solid":  return "jr-card__score--solid";
    case "watch":  return "jr-card__score--watch";
    case "pass":   return "jr-card__score--pass";
    default:       return "jr-card__score--none";
  }
}

function PlayerAvatar({ url, name }) {
  const [err, setErr] = useState(false);
  if (!url || err) {
    return (
      <div className="jr-card__avatar">
        <span className="jr-card__avatar-fallback" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </span>
      </div>
    );
  }
  return (
    <div className="jr-card__avatar">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" onError={() => setErr(true)} />
    </div>
  );
}

function PlayerCard({ player }) {
  const scoreNum = player.score != null ? Number(player.score).toFixed(1) : null;
  const tc = scoreNum != null ? tierClass(player.tier) : "jr-card__score--none";

  return (
    <Link href={`/player/${player.player_id}`} className="jr-card" prefetch={false}>
      <PlayerAvatar url={player.headshot_url} name={player.full_name} />

      <div className="jr-card__info">
        <div className="jr-card__name">{player.full_name}</div>
        <div className="jr-card__meta">
          {player.team_abbrev && <span className="jr-card__team">{player.team_abbrev}</span>}
          {player.team_abbrev && player.position_code && <span className="jr-card__sep" aria-hidden>·</span>}
          {player.position_code && <span className="jr-card__pos">{player.position_code}</span>}
          {player.age != null && <><span className="jr-card__sep" aria-hidden>·</span><span className="jr-card__pos">{player.age} ans</span></>}
        </div>
        <div className="jr-card__stats">
          {player.games_played != null && (
            <span className="jr-card__stat"><strong>{player.games_played}</strong> PJ</span>
          )}
          {player.goals != null && (
            <span className="jr-card__stat"><strong>{player.goals}</strong> B</span>
          )}
          {player.assists != null && (
            <span className="jr-card__stat"><strong>{player.assists}</strong> A</span>
          )}
          {player.points != null && (
            <span className="jr-card__stat"><strong>{player.points}</strong> Pts</span>
          )}
        </div>
      </div>

      <div className={`jr-card__score ${tc}`} aria-label={scoreNum ? `Score ${scoreNum}` : "Score non disponible"}>
        <span className="jr-card__score-num">{scoreNum ?? "—"}</span>
        <span className="jr-card__score-label">score</span>
      </div>
    </Link>
  );
}

function SortBtn({ label, sortKey, current, order, onChange }) {
  const active = current === sortKey;
  const Icon = active ? (order === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      className={`jr-sort-btn${active ? " jr-sort-btn--active" : ""}`}
      onClick={() => onChange(sortKey)}
      aria-pressed={active}
    >
      {label}
      <Icon size={12} aria-hidden />
    </button>
  );
}

export default function JoueursClient({ initialTotal }) {
  const [players, setPlayers] = useState([]);
  const [total, setTotal] = useState(initialTotal ?? 0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [position, setPosition] = useState("");
  const [sort, setSort] = useState("score");
  const [order, setOrder] = useState("desc");

  const debounceRef = useRef(null);

  const fetchPlayers = useCallback(async (params) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(params.page),
        limit: String(LIMIT),
        sort: params.sort,
        order: params.order,
      });
      if (params.search) qs.set("search", params.search);
      if (params.team) qs.set("team", params.team);
      if (params.position) qs.set("position", params.position);

      const res = await fetch(`/api/joueurs?${qs}`);
      const data = await res.json();
      if (data?.ok) {
        setPlayers(data.players ?? []);
        setTotal(data.total ?? 0);
        setPage(data.page ?? 1);
        setPages(data.pages ?? 1);
      }
    } catch { /* réseau indisponible */ }
    setLoading(false);
  }, []);

  // Fetch on filter/sort change (reset to page 1, debounce search)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPlayers({ page: 1, search, team, position, sort, order });
    }, search ? 280 : 0);
    return () => clearTimeout(debounceRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, team, position, sort, order]);

  // Fetch on page change
  useEffect(() => {
    fetchPlayers({ page, search, team, position, sort, order });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleSort(key) {
    if (key === sort) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSort(key);
      setOrder(key === "name" || key === "age" ? "asc" : "desc");
    }
  }

  const startIdx = (page - 1) * LIMIT + 1;
  const endIdx = Math.min(page * LIMIT, total);

  return (
    <>
      {/* Controls */}
      <div className="jr-controls" role="search" aria-label="Filtres joueurs">
        <label className="jr-search">
          <Search size={14} className="jr-search__icon" aria-hidden />
          <input
            className="jr-search__input"
            type="search"
            placeholder="Nom du joueur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Recherche par nom"
          />
        </label>

        <select
          className="jr-filter-select"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          aria-label="Filtrer par équipe"
        >
          <option value="">Toutes équipes</option>
          {NHL_TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          className="jr-filter-select"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          aria-label="Filtrer par position"
        >
          <option value="">Toutes positions</option>
          {POSITIONS.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
        </select>

        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }} role="group" aria-label="Trier par">
          {SORT_OPTIONS.map((o) => (
            <SortBtn
              key={o.key}
              label={o.label}
              sortKey={o.key}
              current={sort}
              order={order}
              onChange={handleSort}
            />
          ))}
        </div>

        <span className="jr-controls__count" aria-live="polite" aria-atomic>
          {loading ? "…" : `${startIdx}–${endIdx} / ${total}`}
        </span>
      </div>

      {/* Grid */}
      {loading && players.length === 0 ? (
        <div className="jr-loading" role="status" aria-label="Chargement">
          <div className="jr-spinner" aria-hidden />
          Chargement…
        </div>
      ) : players.length === 0 ? (
        <div className="jr-empty">Aucun joueur trouvé.</div>
      ) : (
        <div
          className="jr-grid"
          style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}
          aria-busy={loading}
        >
          {players.map((p) => (
            <PlayerCard key={p.player_id} player={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <nav className="jr-pagination" aria-label="Pagination">
          <button
            className="jr-pagination__btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Page précédente"
          >
            ←
          </button>

          {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
            let p;
            if (pages <= 7) {
              p = i + 1;
            } else if (page <= 4) {
              p = i + 1;
            } else if (page >= pages - 3) {
              p = pages - 6 + i;
            } else {
              p = page - 3 + i;
            }
            return (
              <button
                key={p}
                className={`jr-pagination__btn${p === page ? " jr-pagination__btn--active" : ""}`}
                onClick={() => setPage(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            );
          })}

          <button
            className="jr-pagination__btn"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page >= pages}
            aria-label="Page suivante"
          >
            →
          </button>
        </nav>
      )}
    </>
  );
}
