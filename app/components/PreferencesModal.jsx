"use client";

import { useEffect, useRef, useState } from "react";
import { usePreferences } from "./PreferencesContext";
import "./preferences-modal.css";

const MARKET_OPTIONS = [
  { value: "EBAY_CA", flag: "🇨🇦", label: "eBay Canada", sub: "CAD" },
  { value: "EBAY_US", flag: "🇺🇸", label: "eBay USA", sub: "USD" },
];

export default function PreferencesModal() {
  const { prefsReady, markPrefsReady, t } = usePreferences();
  const [marketplace, setMarketplace] = useState("EBAY_CA");
  const dialogRef = useRef(null);

  // Trap focus
  useEffect(() => {
    if (prefsReady !== false) return;
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button, [role="radio"], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [prefsReady]);

  // prefsReady === null → still loading from localStorage, render nothing
  // prefsReady === false → show modal
  // prefsReady === true → already set, render nothing
  if (prefsReady !== false) return null;

  const confirm = () => markPrefsReady("fr", marketplace);

  return (
    <div className="pm-overlay" role="dialog" aria-modal="true" aria-labelledby="pm-title">
      <div className="pm-card" ref={dialogRef}>
        {/* Header */}
        <div className="pm-header">
          <div className="pm-logo" aria-hidden>◆</div>
          <h2 id="pm-title" className="pm-title">{t("prefs.title")}</h2>
          <p className="pm-sub">{t("prefs.sub")}</p>
        </div>

        {/* Marketplace (le choix de langue est retiré : i18n non branchée) */}
        <fieldset className="pm-group">
          <legend className="pm-group__label">{t("prefs.market.label")}</legend>
          <div className="pm-options">
            {MARKET_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={marketplace === o.value}
                className={`pm-option ${marketplace === o.value ? "pm-option--active" : ""}`}
                onClick={() => setMarketplace(o.value)}
              >
                <span className="pm-option__flag" aria-hidden>{o.flag}</span>
                <div>
                  <span className="pm-option__label">{o.label}</span>
                  <span className="pm-option__sub">{o.sub}</span>
                </div>
              </button>
            ))}
          </div>
        </fieldset>

        {/* CTA */}
        <button type="button" className="pm-confirm" onClick={confirm}>
          {t("prefs.confirm")}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
