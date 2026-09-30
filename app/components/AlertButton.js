"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import AlertFilterFields, { EMPTY_ALERT_FILTERS } from "./AlertFilterFields";
import { useToast } from "./Toast";

// Styles chargés par le composant lui-même : ils n'étaient importés que par
// /player/[id] — sur /opportunites la fenêtre s'affichait sans style, en
// plein milieu de la carte.
import "./alert-button.css";

/**
 * @param {{ playerId: string; playerName: string }} props
 */
export default function AlertButton({ playerId, playerName }) {
  const [open, setOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [filters, setFilters] = useState(EMPTY_ALERT_FILTERS);
  const [authed, setAuthed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(Boolean(data.user)));
  }, []);

  // Échap ferme la fenêtre ; la page derrière ne défile pas pendant qu'elle est ouverte.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function openModal() {
    if (!authed) {
      router.push(`/auth/login?next=/player/${playerId}`);
      return;
    }
    setOpen(true);
    setSuccess(false);
  }

  async function submit(e) {
    e.preventDefault();
    const v = Number(maxPrice);
    if (!Number.isFinite(v) || v <= 0) return;
    setSubmitting(true);
    const r = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, playerName, maxPriceCad: v, ...filters }),
    });
    setSubmitting(false);
    if (r.ok) {
      setSuccess(true);
      setMaxPrice("");
      setFilters(EMPTY_ALERT_FILTERS);
      toast(`Alerte créée pour ${playerName} — ajouté à ta watchlist`, "success");
      setTimeout(() => setOpen(false), 1200);
    } else {
      const data = await r.json().catch(() => null);
      toast(data?.error ?? "Erreur lors de la création de l'alerte", "error");
    }
  }

  return (
    <>
      <button type="button" className="alert-btn" onClick={openModal}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span>Créer une alerte</span>
      </button>

      {/* Portail vers <body> : dans une carte animée (TiltCard, transform CSS),
          position:fixed se cale sur la carte au lieu de l'écran. */}
      {open && typeof document !== "undefined" && createPortal(
        <div className="alert-modal-overlay" role="dialog" aria-modal="true" aria-label={`Alerte prix — ${playerName}`}>
          <div className="alert-modal-backdrop" onClick={() => setOpen(false)} aria-hidden />
          <div className="alert-modal">
            <button type="button" className="alert-modal__close" onClick={() => setOpen(false)} aria-label="Fermer">×</button>
            <h2 className="alert-modal__title">Alerte prix — {playerName}</h2>
            <p className="alert-modal__subtitle">
              Reçois un email dès qu&apos;une carte de {playerName} passe sous ce prix.
            </p>
            {success ? (
              <div className="alert-modal__success">✓ Alerte créée !</div>
            ) : (
              <form onSubmit={submit} className="alert-modal__form">
                <label className="alert-modal__label">
                  Prix maximum (CAD)
                  <div className="alert-modal__input-wrap">
                    <span className="alert-modal__currency">$</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      className="alert-modal__input"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      placeholder="50.00"
                      autoFocus
                      required
                    />
                  </div>
                </label>
                <AlertFilterFields value={filters} onChange={setFilters} idPrefix={`alert-${playerId}`} />
                <button type="submit" className="alert-modal__submit" disabled={submitting}>
                  {submitting ? "Création…" : "Créer l'alerte"}
                </button>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
