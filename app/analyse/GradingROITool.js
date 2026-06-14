"use client";

import { useState } from "react";

const SERVICES = [
  { id: "psa-economy", label: "PSA Economy (~$25 US)", brand: "PSA", costCad: 34 },
  { id: "psa-regular", label: "PSA Regular (~$50 US)", brand: "PSA", costCad: 68 },
  { id: "psa-express", label: "PSA Express (~$150 US)", brand: "PSA", costCad: 205 },
  { id: "bgs-standard", label: "BGS Standard (~$20 US)", brand: "BGS", costCad: 27 },
  { id: "bgs-express", label: "BGS Express (~$50 US)", brand: "BGS", costCad: 68 },
];

const CARD_TYPES = [
  { id: "young-guns", label: "Young Guns (OPC/UD)", psa10Prob: 0.38, mult10: 4.0, mult9: 1.6 },
  { id: "auto", label: "Auto on-card", psa10Prob: 0.55, mult10: 2.8, mult9: 1.4 },
  { id: "canvas", label: "Canvas (OPC)", psa10Prob: 0.33, mult10: 3.5, mult9: 1.5 },
  { id: "parallel", label: "Parallel / SP", psa10Prob: 0.44, mult10: 3.0, mult9: 1.4 },
  { id: "base", label: "Carte de base", psa10Prob: 0.58, mult10: 1.8, mult9: 1.2 },
  { id: "rookie", label: "Rookie autre", psa10Prob: 0.50, mult10: 2.5, mult9: 1.3 },
];

const SHIPPING_BUFFER = 18; // ~$18 CAD shipping + fees buffer

function fmtCad(n) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function calcROI({ rawPrice, serviceId, cardTypeId }) {
  const service = SERVICES.find((s) => s.id === serviceId);
  const card = CARD_TYPES.find((c) => c.id === cardTypeId);
  if (!service || !card || !rawPrice) return null;

  const totalCost = rawPrice + service.costCad + SHIPPING_BUFFER;
  const p10 = card.psa10Prob;
  const p9 = 0.28;
  const pLower = Math.max(0, 1 - p10 - p9);

  const price10 = rawPrice * card.mult10;
  const price9 = rawPrice * card.mult9;
  const priceLower = rawPrice * 0.7; // rough resale after slab

  const expectedValue = p10 * price10 + p9 * price9 + pLower * priceLower;
  const roiPct = ((expectedValue - totalCost) / totalCost) * 100;

  let verdict, verdictClass;
  if (roiPct >= 50) { verdict = "Rentable — recommandé"; verdictClass = "roi--buy"; }
  else if (roiPct >= 10) { verdict = "Marginal — selon vos priorités"; verdictClass = "roi--hold"; }
  else { verdict = "Pas rentable au prix actuel"; verdictClass = "roi--pass"; }

  return {
    totalCost,
    price10,
    p10Pct: Math.round(p10 * 100),
    expectedValue,
    roiPct: Math.round(roiPct),
    verdict,
    verdictClass,
    service,
    card,
  };
}

export default function GradingROITool() {
  const [rawPrice, setRawPrice] = useState("");
  const [serviceId, setServiceId] = useState("psa-regular");
  const [cardTypeId, setCardTypeId] = useState("young-guns");
  const [result, setResult] = useState(null);

  function handleCalc(e) {
    e.preventDefault();
    const price = parseFloat(rawPrice.replace(",", "."));
    if (!price || price <= 0) return;
    setResult(calcROI({ rawPrice: price, serviceId, cardTypeId }));
  }

  return (
    <section className="roi-section">
      <div className="roi-header">
        <span className="cn-eyebrow">
          <span className="cn-eyebrow__dot" aria-hidden />
          OUTIL · HEURISTIQUE
        </span>
        <h2 className="roi-title">Grading ROI Estimator</h2>
        <p className="roi-sub">
          Saisissez le prix raw et le type de carte — obtenez une estimation instantanée
          du coût de grading, du ROI et de la probabilité PSA 10.
        </p>
      </div>

      <form className="roi-form" onSubmit={handleCalc}>
        <div className="roi-form__grid">
          <div className="roi-field">
            <label htmlFor="roi-price" className="roi-label">Prix raw (CAD)</label>
            <input
              id="roi-price"
              type="number"
              min="1"
              step="0.01"
              className="roi-input"
              placeholder="ex. 45"
              value={rawPrice}
              onChange={(e) => setRawPrice(e.target.value)}
              required
            />
          </div>

          <div className="roi-field">
            <label htmlFor="roi-type" className="roi-label">Type de carte</label>
            <select id="roi-type" className="roi-select" value={cardTypeId} onChange={(e) => setCardTypeId(e.target.value)}>
              {CARD_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>

          <div className="roi-field">
            <label htmlFor="roi-service" className="roi-label">Service de grading</label>
            <select id="roi-service" className="roi-select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" className="roi-btn">
          Calculer le ROI →
        </button>
      </form>

      {result && (
        <div className={`roi-result ${result.verdictClass}`}>
          <div className="roi-result__verdict">
            <span className="roi-result__badge">{result.verdict}</span>
          </div>

          <div className="roi-result__grid">
            <div className="roi-stat">
              <span className="roi-stat__label">Coût total</span>
              <span className="roi-stat__val">{fmtCad(result.totalCost)}</span>
              <span className="roi-stat__note">raw + grading + envoi</span>
            </div>
            <div className="roi-stat">
              <span className="roi-stat__label">Prob. PSA/BGS 10</span>
              <span className="roi-stat__val roi-stat__val--pct">{result.p10Pct}%</span>
              <span className="roi-stat__note">estimation par type de carte</span>
            </div>
            <div className="roi-stat">
              <span className="roi-stat__label">Prix estimé si 10</span>
              <span className="roi-stat__val">{fmtCad(result.price10)}</span>
              <span className="roi-stat__note">×{result.card.mult10} du raw</span>
            </div>
            <div className="roi-stat roi-stat--roi">
              <span className="roi-stat__label">ROI espéré</span>
              <span className="roi-stat__val roi-stat__val--big">
                {result.roiPct > 0 ? "+" : ""}{result.roiPct}%
              </span>
              <span className="roi-stat__note">valeur esp. ÷ coût total</span>
            </div>
          </div>

          <p className="roi-disclaimer">
            Estimations heuristiques basées sur les moyennes du marché PSA 2024-2025.
            Les probabilités et multiplicateurs varient selon l&apos;état de la carte.
          </p>
        </div>
      )}
    </section>
  );
}
