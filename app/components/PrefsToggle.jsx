"use client";

import "./prefs-toggle.css";
import { usePreferences } from "./PreferencesContext";

function Pill({ options, value, onChange }) {
  return (
    <div className="pt-pill">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`pt-pill__btn${value === o.value ? " pt-pill__btn--active" : ""}`}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PrefsToggle({ showLang = true, showMarket = true, className = "" }) {
  const { locale, marketplace, setLocale, setMarketplace } = usePreferences();

  return (
    <div className={`pt-wrap${className ? ` ${className}` : ""}`}>
      {showLang && (
        <Pill
          value={locale}
          options={[
            { value: "fr", label: "FR" },
            { value: "en", label: "EN" },
          ]}
          onChange={setLocale}
        />
      )}
      {showMarket && (
        <Pill
          value={marketplace}
          options={[
            { value: "EBAY_CA", label: "🇨🇦 CA" },
            { value: "EBAY_US", label: "🇺🇸 US" },
          ]}
          onChange={setMarketplace}
        />
      )}
    </div>
  );
}
