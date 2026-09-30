"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import {
  ALERT_CARD_TYPES,
  ALERT_CONDITIONS,
  ALERT_KEYWORD_MAX,
  ALERT_MIN_SCORES,
} from "@/lib/alertFilters";

import "./alert-filters.css";

/** Filtres vides = comportement historique (toute carte du joueur sous le prix). */
export const EMPTY_ALERT_FILTERS = { cardTypes: [], condition: "any", minScore: null, keyword: "" };

/**
 * Filtres optionnels d'une alerte prix (repliés par défaut). Partagé par la
 * page joueur (AlertButton) et le Deal Finder (PriceAlertModal).
 * @param {{ value: typeof EMPTY_ALERT_FILTERS; onChange: (v: typeof EMPTY_ALERT_FILTERS) => void; idPrefix: string }} props
 */
export default function AlertFilterFields({ value, onChange, idPrefix }) {
  const [open, setOpen] = useState(false);
  const activeCount =
    (value.cardTypes.length > 0 ? 1 : 0) +
    (value.condition !== "any" ? 1 : 0) +
    (value.minScore != null ? 1 : 0) +
    (value.keyword.trim() ? 1 : 0);

  function toggleType(id) {
    const has = value.cardTypes.includes(id);
    onChange({ ...value, cardTypes: has ? value.cardTypes.filter((t) => t !== id) : [...value.cardTypes, id] });
  }

  return (
    <div className="af">
      <button
        type="button"
        className="af__toggle"
        aria-expanded={open}
        aria-controls={`${idPrefix}-filters`}
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal size={16} aria-hidden />
        <span>Filtres{activeCount > 0 ? ` (${activeCount})` : " (optionnel)"}</span>
        <ChevronDown size={16} aria-hidden className={open ? "af__chev af__chev--open" : "af__chev"} />
      </button>

      {open && (
        <div className="af__body" id={`${idPrefix}-filters`}>
          <fieldset className="af__group">
            <legend className="af__legend">Types de carte</legend>
            <p className="af__hint">Aucun coché = toutes les cartes.</p>
            <div className="af__chips">
              {ALERT_CARD_TYPES.map((t) => {
                const on = value.cardTypes.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={on ? "af__chip af__chip--on" : "af__chip"}
                    aria-pressed={on}
                    onClick={() => toggleType(t.id)}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="af__group">
            <legend className="af__legend">État</legend>
            <div className="af__seg" role="radiogroup">
              {ALERT_CONDITIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={value.condition === c.id}
                  className={value.condition === c.id ? "af__seg-btn af__seg-btn--on" : "af__seg-btn"}
                  onClick={() => onChange({ ...value, condition: c.id })}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="af__group">
            <label className="af__legend" htmlFor={`${idPrefix}-score`}>Score minimum de l&apos;annonce</label>
            <select
              id={`${idPrefix}-score`}
              className="af__input"
              value={value.minScore ?? ""}
              onChange={(e) => onChange({ ...value, minScore: e.target.value ? Number(e.target.value) : null })}
            >
              {ALERT_MIN_SCORES.map((s) => (
                <option key={s ?? "none"} value={s ?? ""}>
                  {s == null ? "Aucun minimum" : `${s}/10 et plus`}
                </option>
              ))}
            </select>
            <p className="af__hint">Le même score que dans le Deal Finder.</p>
          </div>

          <div className="af__group">
            <label className="af__legend" htmlFor={`${idPrefix}-kw`}>Mot-clé dans le titre</label>
            <input
              id={`${idPrefix}-kw`}
              type="text"
              className="af__input"
              maxLength={ALERT_KEYWORD_MAX}
              placeholder="ex. Series 1, #201, Red Prism"
              value={value.keyword}
              onChange={(e) => onChange({ ...value, keyword: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
