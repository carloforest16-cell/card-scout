/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PlayerPicker({ onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleInput(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/player?q=${encodeURIComponent(q.trim())}`);
        const data = await r.json();
        const list = data?.results ?? data?.players ?? data ?? [];
        setResults(Array.isArray(list) ? list.slice(0, 8) : []);
      } catch { setResults([]); }
      setLoading(false);
    }, 280);
  }

  return (
    <div className="cmp-picker" role="dialog" aria-modal="true" aria-label="Choisir un joueur">
      <div className="cmp-picker__overlay" onClick={onClose} aria-hidden />
      <div className="cmp-picker__panel">
        <div className="cmp-picker__input-wrap">
          <IconSearch />
          <input
            ref={inputRef}
            type="text"
            className="cmp-picker__input"
            placeholder="Cherche un joueur à ajouter…"
            value={query}
            onChange={handleInput}
            autoComplete="off"
          />
          <button type="button" className="cmp-picker__esc" onClick={onClose}>ESC</button>
        </div>
        {loading && <p className="cmp-picker__hint">Recherche…</p>}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <p className="cmp-picker__hint">Aucun joueur trouvé.</p>
        )}
        {results.length > 0 && (
          <ul className="cmp-picker__results">
            {results.map((p) => (
              <li key={p.playerId ?? p.id}>
                <button
                  type="button"
                  className="cmp-picker__row"
                  onClick={() => onPick(p.playerId ?? p.id)}
                >
                  {p.headshotUrl && <img src={p.headshotUrl} alt="" className="cmp-picker__avatar" />}
                  <div className="cmp-picker__info">
                    <span className="cmp-picker__name">{p.name ?? p.fullName}</span>
                    <span className="cmp-picker__meta">{p.team ?? p.teamName ?? "—"} · {p.position ?? "—"}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ScoreRing({ value }) {
  const v = Number(value);
  const pct = Number.isFinite(v) ? Math.max(0, Math.min(10, v)) * 10 : 0;
  const dash = (pct / 100) * 282.6;
  return (
    <div className="cmp-ring">
      <svg viewBox="0 0 100 100" className="cmp-ring__svg" aria-hidden>
        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle
          cx="50" cy="50" r="45"
          fill="none"
          stroke="url(#cmp-ring-grad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} 282.6`}
          transform="rotate(-90 50 50)"
        />
        <defs>
          <linearGradient id="cmp-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00D4FF" />
            <stop offset="100%" stopColor="#FFB800" />
          </linearGradient>
        </defs>
      </svg>
      <div className="cmp-ring__val">
        {Number.isFinite(v) ? v.toFixed(1) : "—"}
        <span className="cmp-ring__max">/10</span>
      </div>
    </div>
  );
}

function PlayerColumn({ player, onRemove }) {
  return (
    <div className="cmp-col">
      <button type="button" className="cmp-col__remove" onClick={onRemove} aria-label="Retirer">
        <IconX />
      </button>
      <Link href={`/player/${player.id}`} className="cmp-col__head">
        {player.headshot ? (
          <img src={player.headshot} alt="" className="cmp-col__photo" />
        ) : (
          <span className="cmp-col__photo cmp-col__photo--ph" />
        )}
        <span className="cmp-col__name">{player.name}</span>
        <span className="cmp-col__meta">{player.team ?? "—"} · {player.position ?? "—"}</span>
      </Link>

      <div className="cmp-col__score">
        <ScoreRing value={player.score} />
        {player.tier && <span className="cmp-col__tier">Tier · {player.tier}</span>}
      </div>

      {player.breakdown && typeof player.breakdown === "object" && (
        <ul className="cmp-col__breakdown">
          {Object.entries(player.breakdown).slice(0, 7).map(([k, v]) => {
            const num = typeof v === "object" ? Number(v?.score ?? v?.value ?? NaN) : Number(v);
            return (
              <li key={k} className="cmp-col__factor">
                <span className="cmp-col__factor-label">{k}</span>
                <span className="cmp-col__factor-bar" aria-hidden>
                  <span
                    className="cmp-col__factor-fill"
                    style={{ width: `${Number.isFinite(num) ? Math.max(0, Math.min(100, (num / 10) * 100)) : 0}%` }}
                  />
                </span>
                <span className="cmp-col__factor-val">{Number.isFinite(num) ? num.toFixed(1) : "—"}</span>
              </li>
            );
          })}
        </ul>
      )}

      {player.stats && (
        <div className="cmp-col__stats">
          <h3 className="cmp-col__section-title">Saison en cours</h3>
          <dl className="cmp-col__stats-grid">
            <div><dt>PJ</dt><dd>{player.stats.gamesPlayed ?? "—"}</dd></div>
            <div><dt>B</dt><dd>{player.stats.goals ?? "—"}</dd></div>
            <div><dt>A</dt><dd>{player.stats.assists ?? "—"}</dd></div>
            <div><dt>PTS</dt><dd>{player.stats.points ?? "—"}</dd></div>
          </dl>
        </div>
      )}

      <Link className="cmp-col__cta" href={`/deals?player=${encodeURIComponent(player.name)}`}>
        Voir les deals
      </Link>

      {player.verdict && (
        <p className="cmp-col__verdict">{String(player.verdict).slice(0, 240)}</p>
      )}
    </div>
  );
}

const RECENT_KEY = "cs_recent_compares";

export default function CompareClient({ initialPlayers }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingPick, setLoadingPick] = useState(false);

  useEffect(() => {
    if (players.length >= 2) {
      try {
        const ids = players.map((p) => p.id).join(",");
        const prev = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
        const updated = [ids, ...prev.filter((x) => x !== ids)].slice(0, 5);
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      } catch { /* */ }
    }
  }, [players]);

  function updateUrl(next) {
    const ids = next.map((p) => p.id).join(",");
    const url = ids ? `/compare?ids=${ids}` : "/compare";
    window.history.replaceState({}, "", url);
  }

  async function addPlayer(id) {
    setLoadingPick(true);
    setPickerOpen(false);
    try {
      const r = await fetch(`/api/compare/player?id=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error("fail");
      const data = await r.json();
      if (!data?.player) throw new Error("no data");
      setPlayers((xs) => {
        if (xs.find((p) => p.id === data.player.id)) return xs;
        const next = [...xs, data.player].slice(0, 3);
        updateUrl(next);
        return next;
      });
    } catch {
      // silencieux — on garde l'état actuel
    } finally {
      setLoadingPick(false);
    }
  }

  function removePlayer(id) {
    setPlayers((xs) => {
      const next = xs.filter((p) => p.id !== id);
      updateUrl(next);
      return next;
    });
  }

  return (
    <>
      <div className={`cmp-grid cmp-grid--${players.length}`}>
        {players.map((p) => (
          <PlayerColumn key={p.id} player={p} onRemove={() => removePlayer(p.id)} />
        ))}
        {players.length < 3 && (
          <button type="button" className="cmp-add" onClick={() => setPickerOpen(true)} disabled={loadingPick}>
            <IconPlus />
            <span>{loadingPick ? "Ajout…" : "Ajouter un joueur"}</span>
          </button>
        )}
      </div>
      {pickerOpen && <PlayerPicker onPick={addPlayer} onClose={() => setPickerOpen(false)} />}
    </>
  );
}
