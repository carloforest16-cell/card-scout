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

export default function PrefsToggle({ showMarket = true, className = "" }) {
  // Le sélecteur de langue (FR/EN) est retiré : l'i18n n'est pas branchée, choisir
  // « EN » ne traduisait rien. Seul le marché eBay (CA/US), lui fonctionnel, reste.
  // lib/i18n est conservé pour un vrai chantier i18n futur.
  const { marketplace, setMarketplace } = usePreferences();

  return (
    <div className={`pt-wrap${className ? ` ${className}` : ""}`}>
      {showMarket && (
        <Pill
          value={marketplace}
          options={[
            { value: "EBAY_CA", label: "CA $" },
            { value: "EBAY_US", label: "US $" },
          ]}
          onChange={setMarketplace}
        />
      )}
    </div>
  );
}
