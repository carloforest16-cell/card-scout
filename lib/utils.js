import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Convention unique pour tout affichage "prix vs cote du marché" sur le
 * site : négatif = sous la cote (bon pour l'acheteur), positif = au-dessus.
 * Toujours signé explicitement, arrondi entier, libellé "vs cote" identique
 * partout — voir tâche 2.4 du plan Next Level.
 * @param {number | null | undefined} pct
 * @returns {string | null}
 */
export function formatVsMarket(pct) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const rounded = Math.round(pct);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "±";
  return `${sign}${Math.abs(rounded)}% vs cote`;
}

/**
 * Ton visuel associé à un delta "vs cote" : sous la cote = bon (profit),
 * au-dessus = neutre/mauvais (loss), proche = neutre.
 * @param {number | null | undefined} pct
 * @returns {"profit" | "loss" | "neutral"}
 */
export function vsMarketTone(pct) {
  if (pct == null || !Number.isFinite(pct)) return "neutral";
  const rounded = Math.round(pct);
  if (rounded <= -10) return "profit";
  if (rounded >= 10) return "loss";
  return "neutral";
}
