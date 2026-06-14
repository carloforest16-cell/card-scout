"use client";

import { useState } from "react";
import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";

/* ─── Data ──────────────────────────────────────────────────────────────── */

const SERVICES = [
  { id: "psa-economy",  brand: "PSA", tier: "Economy",  costCad: 35,  turnaround: "~6 mois" },
  { id: "psa-regular",  brand: "PSA", tier: "Regular",  costCad: 69,  turnaround: "~3 mois" },
  { id: "psa-express",  brand: "PSA", tier: "Express",  costCad: 205, turnaround: "~1 mois" },
  { id: "bgs-standard", brand: "BGS", tier: "Standard", costCad: 28,  turnaround: "~3 mois" },
  { id: "bgs-express",  brand: "BGS", tier: "Express",  costCad: 69,  turnaround: "~1 mois" },
];

const CARD_TYPES = [
  { id: "young-guns", label: "Young Guns (OPC/UD)", p10: 0.38, mult10: 4.0, mult9: 1.6, note: "Très populaire, centering critique" },
  { id: "auto",       label: "Auto on-card",        p10: 0.55, mult10: 2.8, mult9: 1.4, note: "Centering moins important, forte prime PSA 10" },
  { id: "canvas",     label: "Canvas (OPC)",         p10: 0.33, mult10: 3.5, mult9: 1.5, note: "Finition mate, dommages de surface fréquents" },
  { id: "parallel",   label: "Parallel / SP",        p10: 0.44, mult10: 3.0, mult9: 1.4, note: "Edges et corners décisifs" },
  { id: "base",       label: "Carte de base",        p10: 0.58, mult10: 1.8, mult9: 1.2, note: "Prime PSA 10 modeste sur cartes communes" },
  { id: "rookie",     label: "Rookie autre",          p10: 0.50, mult10: 2.5, mult9: 1.3, note: "Varie beaucoup selon le set" },
];

const SHIPPING_BUFFER = 18; // ~$18 CAD envoi + frais retour estimés

/* ─── Calc ───────────────────────────────────────────────────────────────── */

function calcROI(rawPrice, serviceId, cardTypeId) {
  const svc  = SERVICES.find((s) => s.id === serviceId);
  const card = CARD_TYPES.find((c) => c.id === cardTypeId);
  if (!svc || !card || !rawPrice || rawPrice <= 0) return null;

  const totalCost  = rawPrice + svc.costCad + SHIPPING_BUFFER;
  const p10        = card.p10;
  const p9         = 0.28;
  const pLower     = Math.max(0, 1 - p10 - p9);

  const ev = p10 * (rawPrice * card.mult10)
           + p9  * (rawPrice * card.mult9)
           + pLower * (rawPrice * 0.72);

  const roiPct = Math.round(((ev - totalCost) / totalCost) * 100);

  let verdict, tone;
  if (roiPct >= 50)      { verdict = "Rentable";         tone = "buy"; }
  else if (roiPct >= 10) { verdict = "Marginal";         tone = "hold"; }
  else                   { verdict = "Pas rentable";     tone = "pass"; }

  return {
    totalCost: Math.round(totalCost),
    price10: Math.round(rawPrice * card.mult10),
    price9:  Math.round(rawPrice * card.mult9),
    p10Pct:  Math.round(p10 * 100),
    p9Pct:   Math.round(p9  * 100),
    ev: Math.round(ev),
    roiPct,
    verdict,
    tone,
    svc,
    card,
  };
}

function fmt(n) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

/* ─── Custom Select ──────────────────────────────────────────────────────── */

function CustomSelect({ id, label, value, onChange, children }) {
  return (
    <div className="gr-field">
      <label htmlFor={id} className="gr-label">{label}</label>
      <div className="gr-select-wrap">
        <select id={id} className="gr-select" value={value} onChange={(e) => onChange(e.target.value)}>
          {children}
        </select>
        <svg className="gr-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

/* ─── Probability bar ────────────────────────────────────────────────────── */

function ProbBar({ label, pct, color }) {
  return (
    <div className="gr-prob">
      <div className="gr-prob__head">
        <span className="gr-prob__label">{label}</span>
        <span className="gr-prob__val" style={{ color }}>{pct}%</span>
      </div>
      <div className="gr-prob__track">
        <div className="gr-prob__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

export default function GradingClient() {
  const [rawPrice,   setRawPrice]   = useState("");
  const [serviceId,  setServiceId]  = useState("psa-regular");
  const [cardTypeId, setCardTypeId] = useState("young-guns");
  const [result,     setResult]     = useState(null);

  function handleCalc(e) {
    e.preventDefault();
    const price = parseFloat(String(rawPrice).replace(",", "."));
    setResult(calcROI(price, serviceId, cardTypeId));
  }

  const r = result;

  return (
    <div className="gr-page cinematic">
      <ScrollProgress />
      <Atmosphere />
      <div className="gr-rail"><AppNav active="grading" /></div>

      <main className="gr-main">

        {/* ── Hero ── */}
        <Reveal as="header" className="gr-hero">
          <p className="cn-eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            PSA · BGS · ESTIMATION · HEURISTIQUE
          </p>
          <h1 className="cn-h1">
            VAUT-IL LA PEINE <span className="cn-h1__ice">DE GRADER ?</span>
          </h1>
          <p className="gr-hero__sub">
            Entrez le prix raw, le type de carte et le service — obtenez en
            une seconde le coût total, la probabilité PSA&nbsp;10 et le ROI espéré.
          </p>
        </Reveal>

        {/* ── Form ── */}
        <Reveal>
          <form className="gr-form" onSubmit={handleCalc}>
            <div className="gr-form__fields">

              {/* Prix raw */}
              <div className="gr-field">
                <label htmlFor="gr-price" className="gr-label">Prix raw (CAD)</label>
                <div className="gr-price-wrap">
                  <span className="gr-price-prefix">$</span>
                  <input
                    id="gr-price"
                    type="number"
                    min="1"
                    step="0.01"
                    className="gr-price-input"
                    placeholder="45"
                    value={rawPrice}
                    onChange={(e) => setRawPrice(e.target.value)}
                    required
                    inputMode="decimal"
                  />
                </div>
              </div>

              <CustomSelect id="gr-type" label="Type de carte" value={cardTypeId} onChange={setCardTypeId}>
                {CARD_TYPES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </CustomSelect>

              <CustomSelect id="gr-service" label="Service de grading" value={serviceId} onChange={setServiceId}>
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.brand} {s.tier} · {fmt(s.costCad)} · {s.turnaround}
                  </option>
                ))}
              </CustomSelect>

            </div>

            {/* Card type note */}
            {cardTypeId && (
              <p className="gr-type-note">
                <span className="gr-type-note__dot" aria-hidden />
                {CARD_TYPES.find((c) => c.id === cardTypeId)?.note}
              </p>
            )}

            <button type="submit" className="gr-btn">
              Calculer le ROI
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </Reveal>

        {/* ── Result ── */}
        {r && (
          <Reveal>
            <div className={`gr-result gr-result--${r.tone}`}>

              {/* Verdict banner */}
              <div className="gr-verdict">
                <span className="gr-verdict__badge">{r.verdict}</span>
                <span className="gr-verdict__roi">
                  {r.roiPct > 0 ? "+" : ""}{r.roiPct}% ROI espéré
                </span>
              </div>

              {/* 4 stats */}
              <div className="gr-stats">
                <div className="gr-stat">
                  <span className="gr-stat__label">Investissement total</span>
                  <span className="gr-stat__val">{fmt(r.totalCost)}</span>
                  <span className="gr-stat__note">raw · {r.svc.brand} {r.svc.tier} · envoi</span>
                </div>
                <div className="gr-stat">
                  <span className="gr-stat__label">Prix estimé si PSA/BGS 10</span>
                  <span className="gr-stat__val">{fmt(r.price10)}</span>
                  <span className="gr-stat__note">×{r.card.mult10} le raw · {r.svc.turnaround}</span>
                </div>
                <div className="gr-stat">
                  <span className="gr-stat__label">Valeur espérée pondérée</span>
                  <span className="gr-stat__val">{fmt(r.ev)}</span>
                  <span className="gr-stat__note">prob × prix par grade</span>
                </div>
                <div className={`gr-stat gr-stat--roi`}>
                  <span className="gr-stat__label">ROI espéré</span>
                  <span className="gr-stat__val gr-stat__val--big">
                    {r.roiPct > 0 ? "+" : ""}{r.roiPct}%
                  </span>
                  <span className="gr-stat__note">valeur esp. vs coût total</span>
                </div>
              </div>

              {/* Probability bars */}
              <div className="gr-probs">
                <h3 className="gr-probs__title">Distribution de grades estimée</h3>
                <ProbBar label="PSA / BGS 10"   pct={r.p10Pct} color="#4ade80" />
                <ProbBar label="PSA / BGS 9"    pct={r.p9Pct}  color="#fbbf24" />
                <ProbBar label="8 ou moins"     pct={Math.max(0, 100 - r.p10Pct - r.p9Pct)} color="#f87171" />
              </div>

              <p className="gr-disclaimer">
                Estimations heuristiques basées sur les données PSA 2024-2025. Les probabilités
                varient selon l&apos;état de surface, le centering et les corners de ta carte.
                Toujours inspecter avant d&apos;envoyer.
              </p>
            </div>
          </Reveal>
        )}

        {/* ── Reference table ── */}
        <Reveal>
          <div className="gr-ref">
            <h2 className="gr-ref__title">Tarifs de référence (en CAD)</h2>
            <div className="gr-ref__grid">
              {SERVICES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`gr-ref__card${serviceId === s.id ? " gr-ref__card--active" : ""}`}
                  onClick={() => setServiceId(s.id)}
                  aria-pressed={serviceId === s.id}
                >
                  <span className="gr-ref__brand">{s.brand}</span>
                  <span className="gr-ref__tier">{s.tier}</span>
                  <span className="gr-ref__cost">{fmt(s.costCad)}</span>
                  <span className="gr-ref__turnaround">{s.turnaround}</span>
                </button>
              ))}
            </div>
            <p className="gr-ref__note">
              Tarifs approximatifs incluant la conversion USD→CAD (×1.37). Vérifier les prix actuels sur PSA.com et BGSGrading.com.
            </p>
          </div>
        </Reveal>

      </main>
    </div>
  );
}
