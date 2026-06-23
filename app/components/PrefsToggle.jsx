"use client";

import { usePreferences } from "./PreferencesContext";

const LOCALE_FLAGS = { fr: "🇫🇷", en: "🇺🇸" };
const MARKET_LABELS = { EBAY_CA: "eBay CA", EBAY_US: "eBay US" };

export default function PrefsToggle() {
  const { locale, marketplace, resetPrefs } = usePreferences();

  return (
    <button
      type="button"
      onClick={resetPrefs}
      className="prefs-toggle"
      aria-label="Changer langue et marché eBay"
      title="Changer langue / marché eBay"
    >
      <span aria-hidden>{LOCALE_FLAGS[locale] ?? "🌐"}</span>
      <span>{locale.toUpperCase()}</span>
      <span className="prefs-toggle__sep" aria-hidden>·</span>
      <span>{MARKET_LABELS[marketplace] ?? marketplace}</span>
    </button>
  );
}
