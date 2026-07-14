"use client";

import {
  Award,
  Crown,
  Gem,
  Hash,
  Image as ImageIcon,
  Layers,
  Package,
  Palette,
  PenLine,
  RefreshCw,
  Shirt,
  Sparkles,
  Star,
} from "lucide-react";

/**
 * Icône SVG (lucide) pour une catégorie de carte. Les chaînes `groupType`
 * portent un émoji hérité (ex. "⭐ Young Guns") ET servent de clés de cache et
 * de poids — on ne les renomme donc PAS (voir CLAUDE.md, rename = prod cassée
 * 2 semaines). Ce composant mappe la chaîne vers une icône, et `stripCategoryEmoji`
 * retire l'émoji uniquement pour l'affichage.
 */
const CATEGORY_ICON_RULES = [
  [/Renewed/i, RefreshCw],
  [/Auto|RPA|Autograph/i, PenLine],
  [/Grad|PSA|BGS|SGC/i, Award],
  [/Young\s*Guns|\bYG\b/i, Star],
  [/Jersey|Patch|Relic/i, Shirt],
  [/Numérot|Numbered/i, Hash],
  [/Canvas/i, ImageIcon],
  [/Clear\s*Cut|Acetate/i, Sparkles],
  [/Cup|Ultimate/i, Crown],
  [/SPx|Premier|Allure/i, Gem],
  [/OPC|Platin|Metal|Flair/i, Layers],
  [/Parall|Rainbow/i, Palette],
];

/**
 * Retire l'émoji (et symboles/espaces) de tête d'un libellé de catégorie pour
 * l'affichage. "⭐ Young Guns" → "Young Guns", "✍️ Auto / RPA" → "Auto / RPA".
 * @param {string | null | undefined} label
 * @returns {string}
 */
export function stripCategoryEmoji(label) {
  return String(label ?? "").replace(/^[^\p{L}]+/u, "").trim();
}

/**
 * @param {{ type?: string; size?: number; className?: string }} props
 */
export default function CategoryIcon({ type, size = 15, className = "" }) {
  const t = String(type ?? "");
  const rule = CATEGORY_ICON_RULES.find(([re]) => re.test(t));
  const Icon = rule ? rule[1] : Package;
  return <Icon size={size} className={className} aria-hidden />;
}
