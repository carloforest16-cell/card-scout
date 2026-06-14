"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { useToast } from "./Toast";
import "./fast-add-vault.css";

const CARD_TYPES = [
  "Young Guns", "Young Guns Canvas", "Canvas", "Auto on-card", "Auto sticker",
  "Auto Patch", "Patch", "RPA", "Rookie Auto Patch", "Rookie base",
  "Rookie autre", "Parallel", "Refractor", "Insert", "Tim Hortons", "Carte de base",
];
const GRADES = ["raw", "PSA 10", "PSA 9", "PSA 8", "BGS 9.5", "BGS 9", "SGC 10"];
const PRINT_RUNS = [
  { label: "Non numérotée", value: "" },
  { label: "/999", value: "999" }, { label: "/499", value: "499" },
  { label: "/99", value: "99" }, { label: "/50", value: "50" },
  { label: "/25", value: "25" }, { label: "/10", value: "10" },
  { label: "/5", value: "5" }, { label: "1/1", value: "1" },
];

/**
 * Mini modal "Ajouter au vault" avec le joueur pré-rempli.
 * @param {{ player: { id:string, name:string, team?:string, headshotUrl?:string }, initialPrice?: number, onClose: () => void }} props
 */
export default function FastAddVaultModal({ player, initialPrice, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({
    cardType: "Young Guns",
    grade: "raw",
    printRun: "",
    purchasePrice: initialPrice ? String(Number(initialPrice).toFixed(2)) : "",
    purchaseDate: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.purchasePrice) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId: player.id,
          playerName: player.name,
          team: player.team ?? null,
          headshotUrl: player.headshotUrl ?? null,
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
      toast("Carte ajoutée au vault", "success");
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fav-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fav-modal" role="dialog" aria-modal="true" aria-label="Ajouter au vault">
        <div className="fav-header">
          <div className="fav-player">
            {player.headshotUrl && (
              <img src={player.headshotUrl} alt="" className="fav-player__img" />
            )}
            <div>
              <p className="fav-player__name">{player.name}</p>
              {player.team && <p className="fav-player__team">{player.team}</p>}
            </div>
          </div>
          <button type="button" className="fav-close" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form className="fav-body" onSubmit={handleSubmit}>
          <div className="fav-grid">
            <div className="fav-field fav-field--full">
              <label className="fav-label">Type de carte</label>
              <div className="fav-select-wrap">
                <select className="fav-select" value={form.cardType} onChange={(e) => setForm(f => ({...f, cardType: e.target.value}))}>
                  {CARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <svg className="fav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6"/></svg>
              </div>
            </div>

            <div className="fav-field">
              <label className="fav-label">Grade</label>
              <div className="fav-select-wrap">
                <select className="fav-select" value={form.grade} onChange={(e) => setForm(f => ({...f, grade: e.target.value}))}>
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <svg className="fav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6"/></svg>
              </div>
            </div>

            <div className="fav-field">
              <label className="fav-label">Tirage</label>
              <div className="fav-select-wrap">
                <select className="fav-select" value={form.printRun} onChange={(e) => setForm(f => ({...f, printRun: e.target.value}))}>
                  {PRINT_RUNS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <svg className="fav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6"/></svg>
              </div>
            </div>

            <div className="fav-field">
              <label className="fav-label">Prix d&apos;achat (CAD)</label>
              <div className="fav-price-wrap">
                <span className="fav-price-prefix">$</span>
                <input
                  type="number" min="0.01" step="0.01" inputMode="decimal"
                  className="fav-price-input" placeholder="45.00"
                  value={form.purchasePrice}
                  onChange={(e) => setForm(f => ({...f, purchasePrice: e.target.value}))}
                  required
                />
              </div>
            </div>

            <div className="fav-field">
              <label className="fav-label">Date d&apos;achat</label>
              <input type="date" className="fav-input" value={form.purchaseDate} onChange={(e) => setForm(f => ({...f, purchaseDate: e.target.value}))} />
            </div>

            <div className="fav-field fav-field--full">
              <label className="fav-label">Notes <span className="fav-label--opt">(optionnel)</span></label>
              <input type="text" className="fav-input" placeholder="ex. Corners parfaits" value={form.notes} onChange={(e) => setForm(f => ({...f, notes: e.target.value}))} maxLength={200} />
            </div>
          </div>

          {error && <p className="fav-error">{error}</p>}

          <div className="fav-actions">
            <button type="button" className="fav-btn-sec" onClick={onClose}>Annuler</button>
            <button type="submit" className="fav-btn-pri" disabled={saving || !form.purchasePrice}>
              {saving ? "Ajout…" : "Ajouter au vault →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
