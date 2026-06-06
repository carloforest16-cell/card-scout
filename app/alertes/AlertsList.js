"use client";

import Link from "next/link";
import { useState } from "react";

export function AlertsList({ items: initial }) {
  const [items, setItems] = useState(initial);

  async function remove(id) {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  return (
    <ul className="wl-grid">
      {items.map((a) => (
        <li key={a.id} className="wl-card">
          <div className="wl-card__link" style={{ paddingRight: "0.75rem" }}>
            <div className="wl-card__info">
              <Link href={`/player/${a.player_id}`} className="wl-card__name" style={{ color: "#fff", textDecoration: "none" }}>
                {a.player_name}
              </Link>
              <span className="wl-card__meta">
                Sous <strong style={{ color: "#fbbf24" }}>${Number(a.max_price_cad).toFixed(2)} CAD</strong>
                {a.last_triggered_at && (
                  <> · dernier envoi {new Date(a.last_triggered_at).toLocaleDateString("fr-CA")}</>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => remove(a.id)}
              aria-label="Supprimer"
              style={{
                background: "none",
                border: "1px solid rgba(255 255 255 / 0.15)",
                color: "rgba(255 255 255 / 0.6)",
                borderRadius: "8px",
                padding: "0.4rem 0.7rem",
                fontSize: "0.8125rem",
                cursor: "pointer",
              }}
            >
              Supprimer
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
