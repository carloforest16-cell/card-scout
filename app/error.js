"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("[Card Scout Error]", error);
  }, [error]);

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#05060a",
      color: "#e2e8f0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "2rem",
      fontFamily: "sans-serif",
    }}>
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginBottom: "1.25rem", opacity: 0.8 }}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>

      <h1 style={{ fontSize: "clamp(1.2rem, 3vw, 1.8rem)", fontWeight: 700, margin: "0 0 0.6rem", color: "#f0f6fc" }}>
        Quelque chose s&apos;est cassé
      </h1>

      <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.4)", maxWidth: "360px", lineHeight: 1.6, margin: "0 0 2rem" }}>
        Une erreur inattendue s&apos;est produite. Essaie de recharger la page.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            padding: "0.75rem 1.5rem",
            borderRadius: "9px",
            background: "linear-gradient(135deg,#ef4444,#f97316)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "0.88rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          Réessayer
        </button>
        <Link href="/" style={{
          padding: "0.75rem 1.5rem",
          borderRadius: "9px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
          color: "rgba(255,255,255,0.75)",
          fontWeight: 600,
          fontSize: "0.88rem",
          textDecoration: "none",
        }}>
          Accueil
        </Link>
      </div>
    </div>
  );
}
