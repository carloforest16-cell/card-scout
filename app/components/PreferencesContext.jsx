"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fr } from "@/lib/i18n/fr";
import { en } from "@/lib/i18n/en";

const STORAGE_KEY = "cs_prefs_v1";
const DICTS = { fr, en };

export const PreferencesContext = createContext({
  locale: "fr",
  marketplace: "EBAY_CA",
  prefsReady: false,
  setLocale: () => {},
  setMarketplace: () => {},
  markPrefsReady: () => {},
  resetPrefs: () => {},
  t: (key) => key,
});

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* private mode */ }
}

export function PreferencesProvider({ children }) {
  const [locale, setLocaleState] = useState("fr");
  const [marketplace, setMarketplaceState] = useState("EBAY_CA");
  // null = chargement initial ; true = prêt (défaut à la 1re visite) ; false =
  // afficher le modal — atteint UNIQUEMENT via resetPrefs (réinitialisation
  // explicite), plus à la première visite (le modal ne bloque plus l'accueil).
  const [prefsReady, setPrefsReady] = useState(null);

  useEffect(() => {
    const stored = readStorage();
    if (stored) {
      if (stored.locale === "en" || stored.locale === "fr") setLocaleState(stored.locale);
      if (stored.marketplace === "EBAY_US" || stored.marketplace === "EBAY_CA") {
        setMarketplaceState(stored.marketplace);
      }
    }
    // Première visite : on NE bloque PLUS avec le modal d'accueil (friction avant
    // d'avoir montré la moindre valeur). Défaut silencieux FR + eBay CA/CAD,
    // changeable à tout moment via le PrefsToggle (nav/footer). Le modal reste
    // disponible pour l'action explicite « réinitialiser mes préférences »
    // (resetPrefs → prefsReady=false), où l'utilisateur demande à reconfigurer.
    setPrefsReady(true);
  }, []);

  // Sync html[lang] with locale
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((loc) => {
    setLocaleState(loc);
    const stored = readStorage() ?? {};
    writeStorage({ ...stored, locale: loc });
  }, []);

  const setMarketplace = useCallback((mkt) => {
    setMarketplaceState(mkt);
    const stored = readStorage() ?? {};
    writeStorage({ ...stored, marketplace: mkt });
  }, []);

  const markPrefsReady = useCallback((loc, mkt) => {
    setLocaleState(loc);
    setMarketplaceState(mkt);
    writeStorage({ locale: loc, marketplace: mkt });
    setPrefsReady(true);
  }, []);

  const resetPrefs = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
    setPrefsReady(false);
  }, []);

  const dict = DICTS[locale] ?? DICTS.fr;
  const t = useCallback((key) => dict[key] ?? key, [dict]);

  return (
    <PreferencesContext.Provider
      value={{ locale, marketplace, prefsReady, setLocale, setMarketplace, markPrefsReady, resetPrefs, t }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}

export function useT() {
  const { t } = useContext(PreferencesContext);
  return t;
}
