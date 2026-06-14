"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import CountUp from "../components/CountUp";
import RefreshBar from "../components/RefreshBar";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";
import TiltCard from "../components/TiltCard";
import { useToast } from "../components/Toast";

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CARD_TYPES = [
  "Young Guns", "Young Guns Canvas", "Canvas", "Auto on-card", "Auto sticker",
  "Auto Patch", "Patch", "RPA", "Rookie Auto Patch", "Rookie base",
  "Rookie autre", "Parallel", "Refractor", "Insert", "Tim Hortons", "Carte de base",
];

const GRADES = ["raw", "PSA 10", "PSA 9", "PSA 8", "BGS 9.5", "BGS 9", "SGC 10"];

const PRINT_RUNS = [
  { label: "Non numérotée", value: "" },
  { label: "/999", value: "999" }, { label: "/499", value: "499" },
  { label: "/249", value: "249" }, { label: "/99",  value: "99"  },
  { label: "/50",  value: "50"  }, { label: "/25",  value: "25"  },
  { label: "/10",  value: "10"  }, { label: "/5",   value: "5"   },
  { label: "1/1",  value: "1"   },
];

const GRADE_COLORS = {
  "PSA 10": "#fbbf24", "BGS 9.5": "#fbbf24", "SGC 10": "#fbbf24",
  "PSA 9":  "#94a3b8", "BGS 9":   "#94a3b8",
  "PSA 8":  "#64748b",
  "raw":    "#475569",
};

const TYPE_COLORS = {
  "Young Guns": "#00d4ff", "Young Guns Canvas": "#00b4d8", "Canvas": "#0ea5e9",
  "RPA": "#f97316", "Rookie Auto Patch": "#fb923c", "Auto Patch": "#f59e0b",
  "Auto on-card": "#a78bfa", "Auto sticker": "#c4b5fd",
  "Patch": "#34d399", "Rookie base": "#4ade80", "Rookie autre": "#86efac",
  "Parallel": "#e879f9", "Refractor": "#d946ef",
  "Insert": "#38bdf8", "Tim Hortons": "#ef4444", "Carte de base": "#64748b",
};

/* ─── Utils ──────────────────────────────────────────────────────────────── */

function fmt(n) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}
function fmtDec(n) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(n);
}

/* ─── Add Card Modal ─────────────────────────────────────────────────────── */

function AddCardModal({ onClose, onAdded }) {
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [form, setForm] = useState({
    cardType: "Young Guns", grade: "raw", printRun: "",
    purchasePrice: "", purchaseDate: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleQueryChange(e) {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/player?q=${encodeURIComponent(q.trim())}`);
        const d = await r.json();
        const list = d?.results ?? d?.players ?? d ?? [];
        setResults(Array.isArray(list) ? list.slice(0, 6) : []);
      } catch { setResults([]); }
      setSearching(false);
    }, 280);
  }

  function selectPlayer(p) {
    setSelectedPlayer(p);
    setStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedPlayer || !form.purchasePrice) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: selectedPlayer.playerId ?? selectedPlayer.id,
          playerName: selectedPlayer.name ?? selectedPlayer.fullName,
          team: selectedPlayer.teamAbbrev ?? selectedPlayer.currentTeamAbbrev ?? selectedPlayer.team ?? null,
          headshotUrl: selectedPlayer.headshotUrl ?? null,
          cardType: form.cardType,
          grade: form.grade,
          printRun: form.printRun ? Number(form.printRun) : null,
          purchasePriceCad: parseFloat(form.purchasePrice),
          purchaseDate: form.purchaseDate || null,
          notes: form.notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      onAdded(json.card);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="pf-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pf-modal" role="dialog" aria-modal="true" aria-label="Ajouter une carte">
        <div className="pf-modal__header">
          <span className="pf-modal__step cn-mono">ÉTAPE {step}/2</span>
          <h2 className="pf-modal__title">
            {step === 1 ? "Choisir le joueur" : "Détails de la carte"}
          </h2>
          <button type="button" className="pf-modal__close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Step 1 — Player search */}
        {step === 1 && (
          <div className="pf-modal__body">
            <div className="pf-search-wrap">
              <svg className="pf-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="pf-search-input"
                placeholder="Rechercher un joueur NHL…"
                value={query}
                onChange={handleQueryChange}
                autoComplete="off"
              />
            </div>
            {searching && <p className="pf-search-hint">Recherche…</p>}
            {results.length > 0 && (
              <ul className="pf-player-list">
                {results.map((p) => (
                  <li key={p.playerId ?? p.id}>
                    <button type="button" className="pf-player-btn" onClick={() => selectPlayer(p)}>
                      {p.headshotUrl && <img src={p.headshotUrl} alt="" className="pf-player-avatar" />}
                      <div className="pf-player-info">
                        <span className="pf-player-name">{p.name ?? p.fullName}</span>
                        <span className="pf-player-meta cn-mono">
                          {p.teamAbbrev ?? p.currentTeamAbbrev ?? "—"} · {p.positionCode ?? p.position ?? "—"}
                        </span>
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden style={{width:14,height:14,flexShrink:0}}>
                        <path d="M5 12h14M13 6l6 6-6 6"/>
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="pf-search-hint">Aucun joueur trouvé pour « {query} »</p>
            )}
          </div>
        )}

        {/* Step 2 — Card details */}
        {step === 2 && (
          <form className="pf-modal__body" onSubmit={handleSubmit}>
            {/* Selected player recap */}
            <div className="pf-player-recap">
              {selectedPlayer?.headshotUrl && (
                <img src={selectedPlayer.headshotUrl} alt="" className="pf-player-recap__img" />
              )}
              <div>
                <p className="pf-player-recap__name">{selectedPlayer?.name ?? selectedPlayer?.fullName}</p>
                <p className="pf-player-recap__meta cn-mono">
                  {selectedPlayer?.teamAbbrev ?? selectedPlayer?.currentTeamAbbrev ?? "—"}
                </p>
              </div>
              <button type="button" className="pf-player-recap__change" onClick={() => setStep(1)}>
                Changer
              </button>
            </div>

            <div className="pf-form-grid">
              <div className="pf-field pf-field--full">
                <label className="pf-label">Type de carte</label>
                <div className="pf-select-wrap">
                  <select className="pf-select" value={form.cardType} onChange={(e) => setForm(f => ({...f, cardType: e.target.value}))}>
                    {CARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <svg className="pf-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>

              <div className="pf-field">
                <label className="pf-label">Grade</label>
                <div className="pf-select-wrap">
                  <select className="pf-select" value={form.grade} onChange={(e) => setForm(f => ({...f, grade: e.target.value}))}>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <svg className="pf-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>

              <div className="pf-field">
                <label className="pf-label">Tirage</label>
                <div className="pf-select-wrap">
                  <select className="pf-select" value={form.printRun} onChange={(e) => setForm(f => ({...f, printRun: e.target.value}))}>
                    {PRINT_RUNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <svg className="pf-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>

              <div className="pf-field">
                <label className="pf-label">Prix d&apos;achat (CAD)</label>
                <div className="pf-price-wrap">
                  <span className="pf-price-prefix">$</span>
                  <input
                    type="number" min="0.01" step="0.01" inputMode="decimal"
                    className="pf-price-input" placeholder="45.00"
                    value={form.purchasePrice}
                    onChange={(e) => setForm(f => ({...f, purchasePrice: e.target.value}))}
                    required
                  />
                </div>
              </div>

              <div className="pf-field">
                <label className="pf-label">Date d&apos;achat</label>
                <input
                  type="date" className="pf-input"
                  value={form.purchaseDate}
                  onChange={(e) => setForm(f => ({...f, purchaseDate: e.target.value}))}
                />
              </div>

              <div className="pf-field pf-field--full">
                <label className="pf-label">Notes <span className="pf-label--opt">(optionnel)</span></label>
                <input
                  type="text" className="pf-input" placeholder="ex. Acheté sur eBay, corners parfaits"
                  value={form.notes}
                  onChange={(e) => setForm(f => ({...f, notes: e.target.value}))}
                  maxLength={200}
                />
              </div>
            </div>

            {error && <p className="pf-form-error">{error}</p>}

            <div className="pf-modal__actions">
              <button type="button" className="pf-btn-secondary" onClick={() => setStep(1)}>← Retour</button>
              <button type="submit" className="pf-btn-primary" disabled={saving || !form.purchasePrice}>
                {saving ? "Ajout…" : "Ajouter au vault →"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─── Card tile ──────────────────────────────────────────────────────────── */

function VaultCard({ card, value, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const typeColor = TYPE_COLORS[card.card_type] ?? "#94a3b8";
  const gradeColor = GRADE_COLORS[card.grade] ?? "#94a3b8";
  const isGraded = card.grade !== "raw";

  const est = value?.estimatedValueCad;
  const delta = value?.deltaPct;
  const trend = value?.trend;

  const printRunLabel = card.print_run
    ? card.print_run === 1 ? "1/1" : `/${card.print_run}`
    : null;

  return (
    <TiltCard>
      <article className="pf-card">
        {/* Header */}
        <div className="pf-card__header">
          <span className="pf-card__type-badge" style={{ background: `${typeColor}22`, color: typeColor, borderColor: `${typeColor}44` }}>
            {card.card_type}
          </span>
          {printRunLabel && (
            <span className="pf-card__pr-badge">{printRunLabel}</span>
          )}
          <button
            type="button"
            className={`pf-card__delete${confirming ? " pf-card__delete--confirm" : ""}`}
            onClick={() => confirming ? onDelete(card.id) : setConfirming(true)}
            onBlur={() => setTimeout(() => setConfirming(false), 200)}
            aria-label={confirming ? "Confirmer la suppression" : "Supprimer cette carte"}
          >
            {confirming ? "Confirmer ?" : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            )}
          </button>
        </div>

        {/* Player */}
        <div className="pf-card__player">
          {card.headshot_url ? (
            <img src={card.headshot_url} alt="" className="pf-card__headshot" loading="lazy" />
          ) : (
            <div className="pf-card__headshot-ph" aria-hidden>
              {card.player_name.charAt(0)}
            </div>
          )}
          <div className="pf-card__player-info">
            <span className="pf-card__player-name">{card.player_name}</span>
            <span className="pf-card__player-team cn-mono">{card.team ?? "—"}</span>
          </div>
        </div>

        {/* Grade */}
        <div className="pf-card__grade-row">
          <span className={`pf-card__grade${isGraded ? " pf-card__grade--graded" : ""}`} style={{ color: gradeColor }}>
            {isGraded && <span className="pf-card__grade-dot" style={{ background: gradeColor }} aria-hidden />}
            {card.grade}
          </span>
        </div>

        {/* Prices */}
        <div className="pf-card__prices">
          <div className="pf-card__price-col">
            <span className="pf-card__price-label">Achat</span>
            <span className="pf-card__price-val">{fmtDec(card.purchase_price_cad)}</span>
          </div>
          <div className="pf-card__price-divider" aria-hidden>→</div>
          <div className="pf-card__price-col">
            <span className="pf-card__price-label">Estimé</span>
            {est != null ? (
              <span className={`pf-card__price-val pf-card__price-val--${trend}`}>{fmt(est)}</span>
            ) : (
              <span className="pf-card__price-val pf-card__price-val--loading">…</span>
            )}
          </div>
          {delta != null && (
            <div className={`pf-card__delta pf-card__delta--${trend}`}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta)}%
            </div>
          )}
        </div>

        {/* Sell signal badge */}
        {delta != null && delta >= 25 && (
          <Link href={`/deals?player=${encodeURIComponent(card.player_name)}&signal=acheter`} className="pf-card__signal">
            <span className="pf-card__signal-dot" aria-hidden />
            BON MOMENT · +{delta}%
          </Link>
        )}
      </article>
    </TiltCard>
  );
}

/* ─── P&L Dashboard ──────────────────────────────────────────────────────── */

function PieSVG({ slices }) {
  const r = 56;
  const cx = 70;
  const cy = 70;
  let cumulative = 0;

  function polar(pct, radius) {
    const angle = (pct / 100) * 2 * Math.PI - Math.PI / 2;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  }

  return (
    <svg viewBox="0 0 140 140" className="pf-pie" aria-hidden>
      {slices.map((s, i) => {
        if (s.pct <= 0) return null;
        const startPct = cumulative;
        cumulative += s.pct;
        const [sx, sy] = polar(startPct, r);
        const [ex, ey] = polar(cumulative, r);
        const large = s.pct > 50 ? 1 : 0;
        const d = `M${cx},${cy} L${sx},${sy} A${r},${r} 0 ${large},1 ${ex},${ey} Z`;
        return <path key={i} d={d} fill={s.color} opacity={0.85} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.52} fill="rgba(5,6,10,0.85)" />
    </svg>
  );
}

function PnLDashboard({ cards, values }) {
  // Group estimated value by card type
  const typeMap = {};
  let totalEst = 0;
  cards.forEach((c) => {
    const est = values[c.id]?.estimatedValueCad ?? Number(c.purchase_price_cad);
    typeMap[c.card_type] = (typeMap[c.card_type] ?? 0) + est;
    totalEst += est;
  });

  const slices = Object.entries(typeMap)
    .sort((a, b) => b[1] - a[1])
    .map(([type, val]) => ({
      type,
      val,
      pct: totalEst > 0 ? (val / totalEst) * 100 : 0,
      color: TYPE_COLORS[type] ?? "#64748b",
    }));

  // Top 3 by delta%
  const ranked = cards
    .map((c) => ({ card: c, delta: values[c.id]?.deltaPct ?? 0 }))
    .filter((x) => x.delta !== 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);

  // Best ROI
  const bestROI = ranked[0] ?? null;

  return (
    <Reveal as="section" className="pf-pnl">
      <h2 className="pf-pnl__title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden className="pf-pnl__icon">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
        </svg>
        Analyse P&amp;L
      </h2>

      <div className="pf-pnl__body">
        {/* Pie */}
        <div className="pf-pnl__pie-wrap">
          <PieSVG slices={slices} />
          <ul className="pf-pnl__legend">
            {slices.slice(0, 5).map((s) => (
              <li key={s.type} className="pf-pnl__legend-item">
                <span className="pf-pnl__legend-dot" style={{ background: s.color }} />
                <span className="pf-pnl__legend-label">{s.type}</span>
                <span className="pf-pnl__legend-pct cn-mono">{s.pct.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Top performers */}
        <div className="pf-pnl__performers">
          <p className="pf-pnl__sub cn-mono">TOP PERFORMERS</p>
          {ranked.length === 0 && <p className="pf-pnl__empty">Valeurs en cours de calcul…</p>}
          {ranked.map(({ card, delta }, i) => {
            const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
            return (
              <div key={card.id} className="pf-pnl__performer">
                <span className="pf-pnl__rank cn-mono">#{i + 1}</span>
                {card.headshot_url && <img src={card.headshot_url} alt="" className="pf-pnl__perf-img" />}
                <div className="pf-pnl__perf-info">
                  <span className="pf-pnl__perf-name">{card.player_name}</span>
                  <span className="pf-pnl__perf-type cn-mono">{card.card_type}</span>
                </div>
                <span className={`pf-pnl__perf-delta pf-pnl__perf-delta--${trend} cn-mono`}>
                  {delta > 0 ? "+" : ""}{delta}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Stats */}
        <div className="pf-pnl__stats">
          <div className="pf-pnl__stat">
            <span className="pf-pnl__stat-label cn-mono">Cartes en vault</span>
            <span className="pf-pnl__stat-val">{cards.length}</span>
          </div>
          <div className="pf-pnl__stat">
            <span className="pf-pnl__stat-label cn-mono">Types distincts</span>
            <span className="pf-pnl__stat-val">{Object.keys(typeMap).length}</span>
          </div>
          {bestROI && (
            <div className="pf-pnl__stat">
              <span className="pf-pnl__stat-label cn-mono">Meilleur ROI</span>
              <span className="pf-pnl__stat-val pf-pnl__stat-val--up">
                +{bestROI.delta}%<br />
                <span className="pf-pnl__stat-sub">{bestROI.card.player_name}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </Reveal>
  );
}

/* ─── Sell Signals ───────────────────────────────────────────────────────── */

function SellSignals({ cards, values }) {
  const signals = cards
    .map((c) => ({ card: c, val: values[c.id] }))
    .filter(({ val }) => val?.deltaPct != null && val.deltaPct >= 25)
    .sort((a, b) => b.val.deltaPct - a.val.deltaPct);

  if (signals.length === 0) return null;

  return (
    <Reveal as="section" className="pf-signals">
      <div className="pf-signals__header">
        <span className="pf-signals__dot" aria-hidden />
        <h2 className="pf-signals__title">
          {signals.length} signal{signals.length > 1 ? "s" : ""} de vente détecté{signals.length > 1 ? "s" : ""}
        </h2>
      </div>
      <p className="pf-signals__sub">Ces cartes ont significativement pris de la valeur. C&apos;est peut-être le bon moment de vendre.</p>
      <div className="pf-signals__list">
        {signals.map(({ card, val }) => (
          <div key={card.id} className="pf-signal-row">
            {card.headshot_url && <img src={card.headshot_url} alt="" className="pf-signal-row__img" />}
            <div className="pf-signal-row__info">
              <span className="pf-signal-row__name">{card.player_name}</span>
              <span className="pf-signal-row__type cn-mono">{card.card_type}</span>
            </div>
            <div className="pf-signal-row__prices">
              <span className="pf-signal-row__buy cn-mono">Achat {fmtDec(card.purchase_price_cad)}</span>
              <span className="pf-signal-row__est cn-mono">Estimé {fmt(val.estimatedValueCad)}</span>
            </div>
            <span className="pf-signal-row__delta cn-mono">+{val.deltaPct}%</span>
            <Link
              href={`/deals?player=${encodeURIComponent(card.player_name)}&signal=acheter`}
              className="pf-signal-row__cta"
            >
              Voir les offres →
            </Link>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/* ─── Coach IA ───────────────────────────────────────────────────────────── */

function CoachIA({ cards, values }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const toast = useToast();

  async function analyze() {
    setState("loading");
    setErr("");
    try {
      const res = await fetch("/api/portfolio/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cards, values: Object.values(values) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setResult(json);
      setState("done");
      toast("Analyse terminée — recommandations prêtes", "success");
    } catch (e) {
      setErr(e.message);
      setState("error");
      toast("Erreur lors de l'analyse IA", "error");
    }
  }

  return (
    <Reveal as="section" className="pf-coach">
      <div className="pf-coach__header">
        <div>
          <h2 className="pf-coach__title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="pf-coach__icon">
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
            </svg>
            Coach IA
          </h2>
          <p className="pf-coach__sub">Analyse ton portfolio et reçois des recommandations personnalisées basées sur tes cartes et les scores Card Scout.</p>
        </div>
        {state !== "done" && (
          <button type="button" className="pf-coach__btn" onClick={analyze} disabled={state === "loading" || cards.length === 0}>
            {state === "loading" ? (
              <>
                <span className="pf-coach__spinner" aria-hidden />
                Analyse en cours…
              </>
            ) : "Analyser mon portfolio"}
          </button>
        )}
        {state === "done" && (
          <button type="button" className="pf-coach__btn pf-coach__btn--refresh" onClick={analyze}>
            Rafraîchir
          </button>
        )}
      </div>

      {state === "error" && <p className="pf-coach__error">{err}</p>}

      {state === "done" && result && (
        <>
          {result.resume && <p className="pf-coach__resume">{result.resume}</p>}
          <div className="pf-coach__cols">
            {/* Garder */}
            <div className="pf-coach__col pf-coach__col--keep">
              <p className="pf-coach__col-label cn-mono">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden style={{width:14,height:14}}><path d="M20 6L9 17l-5-5"/></svg>
                Garder
              </p>
              {(result.garder ?? []).map((item, i) => (
                <div key={i} className="pf-coach__item">
                  <span className="pf-coach__item-player">{item.joueur}</span>
                  <span className="pf-coach__item-reason">{item.raison}</span>
                </div>
              ))}
            </div>

            {/* Vendre */}
            <div className="pf-coach__col pf-coach__col--sell">
              <p className="pf-coach__col-label cn-mono">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden style={{width:14,height:14}}><path d="M18 6L6 18M6 6l12 12"/></svg>
                Vendre
              </p>
              {(result.vendre ?? []).map((item, i) => (
                <div key={i} className="pf-coach__item">
                  <span className="pf-coach__item-player">{item.joueur}</span>
                  <span className="pf-coach__item-reason">{item.raison}</span>
                </div>
              ))}
            </div>

            {/* Acheter */}
            <div className="pf-coach__col pf-coach__col--buy">
              <p className="pf-coach__col-label cn-mono">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden style={{width:14,height:14}}><path d="M12 5v14M5 12h14"/></svg>
                Acheter
              </p>
              {(result.acheter ?? []).map((item, i) => (
                <div key={i} className="pf-coach__item">
                  <span className="pf-coach__item-player">{item.suggestion}</span>
                  <span className="pf-coach__item-reason">{item.raison}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Reveal>
  );
}

/* ─── Empty state ────────────────────────────────────────────────────────── */

function EmptyVault({ onAdd }) {
  return (
    <div className="pf-empty">
      <div className="pf-empty__icon" aria-hidden>
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="8" y="16" width="48" height="34" rx="4"/>
          <path d="M20 28h24M20 36h16"/>
          <circle cx="48" cy="48" r="12" fill="var(--void)" stroke="var(--ice)"/>
          <path d="M48 43v10M43 48h10" stroke="var(--ice)" strokeWidth="2"/>
        </svg>
      </div>
      <h2 className="pf-empty__title">Ton vault est vide</h2>
      <p className="pf-empty__sub">Ajoute ta première carte pour commencer à tracker ta collection.</p>
      <button type="button" className="pf-empty__cta" onClick={onAdd}>
        Ajouter une carte →
      </button>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

export default function PortfolioClient() {
  const [cards, setCards] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [valuesLoading, setValuesLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [authError, setAuthError] = useState(false);
  const toast = useToast();

  const fetchCards = useCallback(async () => {
    const res = await fetch("/api/portfolio");
    if (res.status === 401) { setAuthError(true); setLoading(false); return; }
    const json = await res.json();
    setCards(json.cards ?? []);
    setLoading(false);
  }, []);

  const fetchValues = useCallback(async () => {
    if (valuesLoading) return;
    setValuesLoading(true);
    try {
      const res = await fetch("/api/portfolio/value");
      if (!res.ok) return;
      const json = await res.json();
      const map = {};
      (json.values ?? []).forEach((v) => { map[v.cardId] = v; });
      setValues(map);
    } finally {
      setValuesLoading(false);
    }
  }, [valuesLoading]);

  useEffect(() => { fetchCards(); }, [fetchCards]);
  useEffect(() => {
    if (cards.length > 0) fetchValues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length]);

  function handleAdded(card) {
    setCards((prev) => [card, ...prev]);
    toast("Carte ajoutée au vault", "success");
  }

  async function handleDelete(id) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/portfolio?id=${id}`, { method: "DELETE" });
    toast("Carte retirée du vault", "info");
  }

  // Global stats
  const totalCost = cards.reduce((s, c) => s + Number(c.purchase_price_cad), 0);
  const totalEst  = cards.reduce((s, c) => {
    const v = values[c.id]?.estimatedValueCad;
    return s + (v ?? Number(c.purchase_price_cad));
  }, 0);
  const totalGain  = totalEst - totalCost;
  const gainPct    = totalCost > 0 ? Math.round((totalGain / totalCost) * 100) : 0;
  const gainTrend  = totalGain > 0 ? "up" : totalGain < 0 ? "down" : "flat";

  return (
    <div className="pf-page cinematic">
      <ScrollProgress />
      <Atmosphere />
      <div className="pf-rail"><AppNav active="portfolio" /></div>

      <main className="pf-main">

        {/* ── Hero ── */}
        <Reveal as="header" className="pf-hero">
          <p className="cn-eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            CARD SCOUT · VAULT · PORTFOLIO
          </p>
          <h1 className="cn-h1">
            MON <span className="cn-h1__ice">VAULT</span>
          </h1>

          {!loading && cards.length > 0 && (
            <div className="pf-hero__stats">
              <div className="pf-hero__stat">
                <span className="pf-hero__stat-label">Cartes</span>
                <span className="pf-hero__stat-val">{cards.length}</span>
              </div>
              <div className="pf-hero__stat-divider" aria-hidden />
              <div className="pf-hero__stat">
                <span className="pf-hero__stat-label">Valeur estimée</span>
                <span className="pf-hero__stat-val">
                  <CountUp value={totalEst} decimals={0} prefix="$" duration={1200} />
                </span>
              </div>
              <div className="pf-hero__stat-divider" aria-hidden />
              <div className="pf-hero__stat">
                <span className="pf-hero__stat-label">Gain/Perte</span>
                <span className={`pf-hero__stat-val pf-hero__stat-val--${gainTrend}`}>
                  {totalGain >= 0 ? "+" : ""}{fmt(totalGain)}
                  <span className="pf-hero__stat-pct cn-mono">({gainPct > 0 ? "+" : ""}{gainPct}%)</span>
                </span>
              </div>
            </div>
          )}
        </Reveal>

        {/* Auth error */}
        {authError && (
          <div className="pf-auth-error">
            <p>Connecte-toi pour accéder à ton vault.</p>
          </div>
        )}

        {!authError && !loading && cards.length > 0 && (
          <RefreshBar onRefresh={fetchCards} label="Mon Vault" />
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="pf-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="pf-skel" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !authError && cards.length === 0 && (
          <EmptyVault onAdd={() => setShowModal(true)} />
        )}

        {/* Vault grid */}
        {!loading && cards.length > 0 && (
          <div className="pf-grid">
            {cards.map((card) => (
              <VaultCard
                key={card.id}
                card={card}
                value={values[card.id]}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Sell Signals */}
        {!loading && cards.length > 0 && Object.keys(values).length > 0 && (
          <SellSignals cards={cards} values={values} />
        )}

        {/* P&L Dashboard */}
        {!loading && cards.length > 0 && (
          <PnLDashboard cards={cards} values={values} />
        )}

        {/* Coach IA */}
        {!loading && cards.length > 0 && (
          <CoachIA cards={cards} values={values} />
        )}

      </main>

      {/* FAB */}
      {!authError && (
        <button
          type="button"
          className="pf-fab"
          onClick={() => setShowModal(true)}
          aria-label="Ajouter une carte au vault"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span>Ajouter</span>
        </button>
      )}

      {/* Modal */}
      {showModal && (
        <AddCardModal
          onClose={() => setShowModal(false)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
