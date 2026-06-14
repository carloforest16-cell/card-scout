"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { useToast } from "./Toast";

/**
 * @param {{ playerId: string; playerName: string }} props
 */
export default function AlertButton({ playerId, playerName }) {
  const [open, setOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState("");
  const [authed, setAuthed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAuthed(Boolean(data.user)));
  }, []);

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
      body: JSON.stringify({ playerId, playerName, maxPriceCad: v }),
    });
    setSubmitting(false);
    if (r.ok) {
      setSuccess(true);
      setMaxPrice("");
      toast(`Alerte créée pour ${playerName}`, "success");
      setTimeout(() => setOpen(false), 1200);
    } else {
      toast("Erreur lors de la création de l'alerte", "error");
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

      {open && (
        <div className="alert-modal-overlay" role="dialog" aria-modal="true">
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
                <button type="submit" className="alert-modal__submit" disabled={submitting}>
                  {submitting ? "Création…" : "Créer l'alerte"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
