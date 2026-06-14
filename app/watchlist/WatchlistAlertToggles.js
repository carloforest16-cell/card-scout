"use client";

import { useState } from "react";

const ALERT_TYPES = [
  { key: "alert_new_listing", label: "Nouveau listing", icon: "🔔" },
  { key: "alert_volume_spike", label: "Spike volume", icon: "📈" },
  { key: "alert_gros_match", label: "Gros match", icon: "⚡" },
];

/**
 * @param {{ watchlistId: string; initial: Record<string, boolean> }} props
 */
export default function WatchlistAlertToggles({ watchlistId, initial }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState(null);

  async function toggle(alertType) {
    const next = !prefs[alertType];
    setPrefs((p) => ({ ...p, [alertType]: next }));
    setSaving(alertType);
    try {
      await fetch("/api/watchlist/alerts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ watchlistId, alertType, enabled: next }),
      });
    } catch {
      // revert on error
      setPrefs((p) => ({ ...p, [alertType]: !next }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="wl-alerts" aria-label="Préférences d'alertes">
      {ALERT_TYPES.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          className={`wl-alert-toggle${prefs[key] ? " wl-alert-toggle--on" : ""}`}
          onClick={(e) => { e.preventDefault(); toggle(key); }}
          aria-pressed={prefs[key]}
          disabled={saving === key}
          title={prefs[key] ? `Désactiver: ${label}` : `Activer: ${label}`}
        >
          <span aria-hidden>{icon}</span>
          <span className="wl-alert-toggle__label">{label}</span>
        </button>
      ))}
    </div>
  );
}
