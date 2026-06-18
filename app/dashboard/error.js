"use client";

import Link from "next/link";
import { useEffect } from "react";

import "../cinematic.css";
import "../error-boundary.css";

export default function DashboardError({ error, reset }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[dashboard error]", error);
    }
  }, [error]);

  return (
    <div className="cinematic eb-page">
      <main className="eb-main">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" />
          TABLEAU DE BORD INDISPONIBLE
        </p>
        <h1 className="cn-h1 eb-title">
          On n&apos;a pas pu charger <span className="eb-title__accent">ton dashboard</span>.
        </h1>
        <p className="eb-sub">
          Probablement un hoquet temporaire (réseau ou cache). Réessaie dans
          quelques secondes — tes données ne sont pas affectées.
        </p>

        <div className="eb-actions">
          <button type="button" className="cn-btn cn-btn--solid eb-btn" onClick={reset}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            Recharger le dashboard
          </button>
          <Link href="/" className="cn-btn cn-btn--ghost eb-btn">
            Retour accueil
          </Link>
        </div>

        {error?.digest && (
          <p className="eb-digest cn-mono">Code de référence : {error.digest}</p>
        )}
      </main>
    </div>
  );
}
