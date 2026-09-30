"use client";

import { useState } from "react";
import { Bell, TrendingUp, Zap } from "lucide-react";

const ALERT_TYPES = [
  { key: "alert_new_listing", label: "Nouveau listing", Icon: Bell },
  { key: "alert_volume_spike", label: "Spike volume", Icon: TrendingUp },
  { key: "alert_gros_match", label: "Gros match", Icon: Zap },
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
      const res = await fetch("/api/watchlist/alerts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ watchlistId, alertType, enabled: next }),
      });
      // Un refus du serveur doit aussi annuler le changement affiché.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // revert on error
      setPrefs((p) => ({ ...p, [alertType]: !next }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="wl-alerts" aria-label="Préférences d'alertes">
      {ALERT_TYPES.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          className={`wl-alert-toggle${prefs[key] ? " wl-alert-toggle--on" : ""}`}
          onClick={(e) => { e.preventDefault(); toggle(key); }}
          aria-pressed={prefs[key]}
          disabled={saving === key}
          title={prefs[key] ? `Désactiver: ${label}` : `Activer: ${label}`}
        >
          <Icon size={14} aria-hidden />
          <span className="wl-alert-toggle__label">{label}</span>
        </button>
      ))}
    </div>
  );
}
