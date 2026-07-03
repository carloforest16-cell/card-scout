"use client";

import "./price-provenance.css";

import { formatRelativeTime } from "@/lib/timeFormat";

const IconInfo = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

/**
 * Badge de provenance de cote — honnête sur d'où vient le prix affiché.
 * Consomme directement la forme `MarketValue` de lib/marketValue.js :
 *   { valueCad, source: "sold"|"asking"|"none", sampleSize, asOfIso, confidence }
 *
 * "sold"   → "Cote : ventes réelles (N) · maj il y a Xh" (ton ice/vert)
 * "asking" → "Cote estimée : annonces actives" (ton neutre + icône info)
 * "none"   → rien (pas de donnée, pas de badge trompeur)
 *
 * @param {{ meta?: { source?: string, sampleSize?: number, asOfIso?: string } | null, className?: string }} props
 */
export default function PriceProvenance({ meta, className = "" }) {
  if (!meta || !meta.source || meta.source === "none") return null;

  const isSold = meta.source === "sold";
  const ago = meta.asOfIso ? formatRelativeTime(meta.asOfIso) : null;
  const n = Number(meta.sampleSize) || 0;

  return (
    <span
      className={`price-prov price-prov--${isSold ? "sold" : "asking"} ${className}`.trim()}
      title={isSold ? `Basé sur ${n} vente${n > 1 ? "s" : ""} réelle${n > 1 ? "s" : ""} (130point)` : "Basé sur les prix des annonces actives eBay, pas des ventes conclues"}
    >
      {!isSold && <IconInfo />}
      <span className="price-prov__full">
        {isSold
          ? `Cote : ventes réelles (${n})${ago ? ` · maj ${ago}` : ""}`
          : "Cote estimée : annonces actives"}
      </span>
      <span className="price-prov__short">
        {isSold ? `ventes réelles${ago ? ` · ${ago}` : ""}` : "estimée"}
      </span>
    </span>
  );
}
