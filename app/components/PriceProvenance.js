"use client";

import "./price-provenance.css";

import { formatRelativeTime } from "@/lib/timeFormat";

const IconInfo = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

const IconCheck = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

function fmtCad(v) {
  if (!Number.isFinite(v)) return null;
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(v);
}

/**
 * Badge de provenance de cote — honnête sur d'où vient le prix affiché.
 * Consomme directement la forme `MarketValue` de lib/marketValue.js :
 *   { valueCad, source: "sold"|"asking"|"none", sampleSize, asOfIso, confidence,
 *     rangeCad?, lastSaleDate?, crossCheck? }
 *
 * "sold"   → "Cote : ventes réelles (N) · 85 $–120 $ · maj il y a Xh"
 *            + "· 2 sources concordent" si le cross-check SportsCardsPro confirme
 * "asking" → "Cote estimée : annonces actives" (ton neutre + icône info)
 * "none"   → rien (pas de donnée, pas de badge trompeur)
 *
 * @param {{ meta?: { source?: string, sampleSize?: number, asOfIso?: string, rangeCad?: { p25Cad?: number, p75Cad?: number } | null, lastSaleDate?: string | null, crossCheck?: { verdict?: string, deltaPct?: number } | null } | null, className?: string }} props
 */
export default function PriceProvenance({ meta, className = "" }) {
  if (!meta || !meta.source || meta.source === "none") return null;

  const isSold = meta.source === "sold";
  const ago = meta.asOfIso ? formatRelativeTime(meta.asOfIso) : null;
  const n = Number(meta.sampleSize) || 0;

  const p25 = fmtCad(meta.rangeCad?.p25Cad);
  const p75 = fmtCad(meta.rangeCad?.p75Cad);
  const range = p25 && p75 ? `${p25}–${p75}` : null;

  const confirmed = meta.crossCheck?.verdict === "confirme";
  const diverges = meta.crossCheck?.verdict === "diverge";

  const titleParts = [];
  if (isSold) {
    titleParts.push(`Basé sur ${n} vente${n > 1 ? "s" : ""} réelle${n > 1 ? "s" : ""} (130point)`);
    if (range) titleParts.push(`fourchette marché ${range}`);
    if (meta.lastSaleDate) titleParts.push(`dernière vente le ${meta.lastSaleDate}`);
    if (confirmed) titleParts.push(`confirmé par SportsCardsPro (écart ${meta.crossCheck?.deltaPct ?? "?"}%)`);
    if (diverges) titleParts.push(`attention : SportsCardsPro diverge de ${meta.crossCheck?.deltaPct ?? "?"}% — prudence`);
  } else {
    titleParts.push("Basé sur les prix des annonces actives eBay, pas des ventes conclues");
  }

  return (
    <span
      className={`price-prov price-prov--${isSold ? "sold" : "asking"} ${className}`.trim()}
      title={titleParts.join(" · ")}
    >
      {!isSold && <IconInfo />}
      {isSold && confirmed && <IconCheck />}
      <span className="price-prov__full">
        {isSold
          ? `Cote : ventes réelles (${n})${range ? ` · ${range}` : ""}${confirmed ? " · 2 sources concordent" : diverges ? " · sources divergent" : ""}${ago ? ` · maj ${ago}` : ""}`
          : "Cote estimée : annonces actives"}
      </span>
      <span className="price-prov__short">
        {isSold ? `ventes réelles${range ? ` · ${range}` : ago ? ` · ${ago}` : ""}` : "estimée"}
      </span>
    </span>
  );
}
