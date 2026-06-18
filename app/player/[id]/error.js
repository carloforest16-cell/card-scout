"use client";

import Link from "next/link";
import { useEffect } from "react";

import "../../cinematic.css";
import "../../error-boundary.css";

export default function PlayerError({ error, reset }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[player page error]", error);
    }
  }, [error]);

  return (
    <div className="cinematic eb-page">
      <main className="eb-main">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" />
          ANALYSE INDISPONIBLE
        </p>
        <h1 className="cn-h1 eb-title">
          Impossible de charger <span className="eb-title__accent">ce joueur</span>.
        </h1>
        <p className="eb-sub">
          La fiche n&apos;a pas pu se construire — données NHL ou eBay
          momentanément indisponibles. Réessaie ou retourne au catalogue.
        </p>

        <div className="eb-actions">
          <button type="button" className="cn-btn cn-btn--solid eb-btn" onClick={reset}>
            Réessayer
          </button>
          <Link href="/deals" className="cn-btn cn-btn--ghost eb-btn">
            Rechercher un autre joueur
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {error?.digest && (
          <p className="eb-digest cn-mono">Code de référence : {error.digest}</p>
        )}
      </main>
    </div>
  );
}
