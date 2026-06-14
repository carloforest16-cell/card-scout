"use client";

import { useState } from "react";
import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";

/* ─── Services ───────────────────────────────────────────────────────────── */

const SERVICES = [
  { id: "psa-economy",  brand: "PSA", tier: "Economy",  costCad: 35,  turnaround: "~6 mois" },
  { id: "psa-regular",  brand: "PSA", tier: "Regular",  costCad: 69,  turnaround: "~3 mois" },
  { id: "psa-express",  brand: "PSA", tier: "Express",  costCad: 205, turnaround: "~1 mois" },
  { id: "bgs-standard", brand: "BGS", tier: "Standard", costCad: 28,  turnaround: "~3 mois" },
  { id: "bgs-express",  brand: "BGS", tier: "Express",  costCad: 69,  turnaround: "~1 mois" },
];

/* ─── Card types ─────────────────────────────────────────────────────────── */

const CARD_GROUPS = [
  {
    group: "Young Guns & Canvas",
    types: [
      { id: "young-guns",  label: "Young Guns (OPC/UD)",    p10: 0.38, mult10: 4.0,  mult9: 1.6, note: "Centering très critique — 55/45 est souvent la limite pour PSA 10" },
      { id: "canvas",      label: "Canvas (OPC)",           p10: 0.33, mult10: 3.5,  mult9: 1.5, note: "Finition mate très sensible aux micro-rayures de surface" },
      { id: "yg-canvas",   label: "Young Guns Canvas",      p10: 0.30, mult10: 4.2,  mult9: 1.6, note: "Rareté supérieure aux YG standard, mais critères PSA plus stricts" },
    ],
  },
  {
    group: "Autos",
    types: [
      { id: "auto",        label: "Auto on-card",           p10: 0.55, mult10: 2.8,  mult9: 1.4, note: "Centering moins décisif — l'auto elle-même est jugée séparément" },
      { id: "auto-sticker",label: "Auto sticker",           p10: 0.60, mult10: 2.0,  mult9: 1.2, note: "Prime PSA 10 plus modeste — autos sticker moins désirées" },
    ],
  },
  {
    group: "Patch / Relic",
    types: [
      { id: "patch",       label: "Patch / Relic",          p10: 0.50, mult10: 2.5,  mult9: 1.3, note: "Épaisseur variable selon le patch — centering et corners décisifs" },
      { id: "auto-patch",  label: "Auto Patch (AP)",        p10: 0.52, mult10: 3.2,  mult9: 1.5, note: "Combo auto + patch — très prisé en PSA 10, fort premium" },
      { id: "rpa",         label: "Rookie Patch Auto (RPA)",p10: 0.50, mult10: 4.8,  mult9: 1.9, note: "Le roi du hobby — premium maximal, mais coût de grading se justifie facilement" },
      { id: "rookie-ap",   label: "Rookie Auto Patch",      p10: 0.50, mult10: 4.2,  mult9: 1.8, note: "Équivalent RPA selon le set — même logique, premium quasi identique" },
    ],
  },
  {
    group: "Parallels & Inserts",
    types: [
      { id: "parallel",    label: "Parallel / SP",          p10: 0.44, mult10: 3.0,  mult9: 1.4, note: "Edges et corners décisifs — foil sensible aux micro-dommages" },
      { id: "insert",      label: "Insert régulier",        p10: 0.52, mult10: 2.2,  mult9: 1.3, note: "Souvent bien centré à la production, mais prime PSA 10 modeste" },
      { id: "refractor",   label: "Refractor / Prizm",      p10: 0.48, mult10: 3.2,  mult9: 1.5, note: "Surface chromée sensible — moindres éraflures visibles sous la lumière" },
    ],
  },
  {
    group: "Base & Rookie",
    types: [
      { id: "base",        label: "Carte de base",          p10: 0.58, mult10: 1.8,  mult9: 1.2, note: "Prime PSA 10 souvent insuffisante pour rentabiliser le grading" },
      { id: "rookie-base", label: "Rookie de base (RC)",    p10: 0.55, mult10: 2.4,  mult9: 1.3, note: "Meilleure prime que la base standard si le joueur performe" },
      { id: "rookie-other",label: "Rookie autre (non-YG)",  p10: 0.50, mult10: 2.5,  mult9: 1.3, note: "Prime variable selon le set et la popularité du joueur" },
      { id: "tim-hortons", label: "Tim Hortons",            p10: 0.45, mult10: 3.0,  mult9: 1.5, note: "Populaire au Canada — centering et surface critiques, pop assez élevé" },
    ],
  },
];

const ALL_TYPES = CARD_GROUPS.flatMap((g) => g.types);

/* ─── Print runs ─────────────────────────────────────────────────────────── */

const PRINT_RUNS = [
  { id: "open",   label: "Non numérotée",   multBonus: 1.00, block: false },
  { id: "pr-999", label: "/999 ou moins",   multBonus: 1.08, block: false },
  { id: "pr-499", label: "/499 ou moins",   multBonus: 1.15, block: false },
  { id: "pr-249", label: "/249 ou moins",   multBonus: 1.25, block: false },
  { id: "pr-99",  label: "/99 ou moins",    multBonus: 1.40, block: false },
  { id: "pr-50",  label: "/50 ou moins",    multBonus: 1.60, block: false },
  { id: "pr-25",  label: "/25 ou moins",    multBonus: 1.85, block: false },
  { id: "pr-10",  label: "/10 ou moins",    multBonus: 2.30, block: false },
  { id: "pr-5",   label: "/5 ou moins",     multBonus: 2.80, block: false },
  { id: "pr-1",   label: "1/1 — Logotype",  multBonus: 1.00, block: true  },
];

const SHIPPING_BUFFER = 18;

/* ─── Calc ───────────────────────────────────────────────────────────────── */

function calcROI(rawPrice, serviceId, cardTypeId, printRunId) {
  const svc  = SERVICES.find((s) => s.id === serviceId);
  const card = ALL_TYPES.find((c) => c.id === cardTypeId);
  const pr   = PRINT_RUNS.find((p) => p.id === printRunId) ?? PRINT_RUNS[0];
  if (!svc || !card || !rawPrice || rawPrice <= 0) return null;

  // Special case: 1/1 — never worth grading
  if (pr.block) {
    return {
      blocked: true,
      blockReason: "Carte 1/1 — le grading n'ajoute pas de valeur",
      blockDetail: "Une pièce unique est déjà la plus rare possible. Les acheteurs sérieux préfèrent l'authenticité eBay. Le coût de grading (+transport) est une perte nette dans 95% des cas.",
      totalCost: Math.round(rawPrice + svc.costCad + SHIPPING_BUFFER),
      svc,
      card,
    };
  }

  const effectiveMult10 = card.mult10 * pr.multBonus;
  const effectiveMult9  = card.mult9  * Math.sqrt(pr.multBonus); // 9 bénéficie moins du tirage

  const totalCost = rawPrice + svc.costCad + SHIPPING_BUFFER;
  const p10       = card.p10;
  const p9        = 0.28;
  const pLower    = Math.max(0, 1 - p10 - p9);

  const ev = p10    * (rawPrice * effectiveMult10)
           + p9     * (rawPrice * effectiveMult9)
           + pLower * (rawPrice * 0.72);

  const roiPct = Math.round(((ev - totalCost) / totalCost) * 100);

  let verdict, tone;
  if (roiPct >= 50)      { verdict = "Rentable";     tone = "buy"; }
  else if (roiPct >= 10) { verdict = "Marginal";     tone = "hold"; }
  else                   { verdict = "Pas rentable"; tone = "pass"; }

  return {
    blocked: false,
    totalCost: Math.round(totalCost),
    price10:   Math.round(rawPrice * effectiveMult10),
    price9:    Math.round(rawPrice * effectiveMult9),
    p10Pct:    Math.round(p10 * 100),
    p9Pct:     Math.round(p9  * 100),
    ev:        Math.round(ev),
    roiPct,
    verdict,
    tone,
    svc,
    card,
    pr,
  };
}

function fmt(n) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

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
  const [rawPrice,    setRawPrice]    = useState("");
  const [serviceId,   setServiceId]   = useState("psa-regular");
  const [cardTypeId,  setCardTypeId]  = useState("young-guns");
  const [printRunId,  setPrintRunId]  = useState("open");
  const [result,      setResult]      = useState(null);

  const currentCard = ALL_TYPES.find((c) => c.id === cardTypeId);
  const currentPR   = PRINT_RUNS.find((p) => p.id === printRunId);

  function handleCalc(e) {
    e.preventDefault();
    const price = parseFloat(String(rawPrice).replace(",", "."));
    setResult(calcROI(price, serviceId, cardTypeId, printRunId));
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
            Prix raw, type de carte, tirage numéroté et service PSA/BGS —
            obtenez instantanément le ROI espéré et si ça vaut le coût.
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

              {/* Type de carte — grouped */}
              <div className="gr-field">
                <label htmlFor="gr-type" className="gr-label">Type de carte</label>
                <div className="gr-select-wrap">
                  <select
                    id="gr-type"
                    className="gr-select"
                    value={cardTypeId}
                    onChange={(e) => setCardTypeId(e.target.value)}
                  >
                    {CARD_GROUPS.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.types.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <svg className="gr-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>

              {/* Tirage */}
              <CustomSelect id="gr-printrun" label="Tirage (print run)" value={printRunId} onChange={setPrintRunId}>
                {PRINT_RUNS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </CustomSelect>

              {/* Service */}
              <CustomSelect id="gr-service" label="Service de grading" value={serviceId} onChange={setServiceId}>
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.brand} {s.tier} · {fmt(s.costCad)} · {s.turnaround}
                  </option>
                ))}
              </CustomSelect>

            </div>

            {/* Contextual notes */}
            <div className="gr-notes">
              {currentCard && (
                <p className="gr-type-note">
                  <span className="gr-type-note__dot" aria-hidden />
                  <strong>{currentCard.label} :</strong> {currentCard.note}
                </p>
              )}
              {currentPR && printRunId !== "open" && !currentPR.block && (
                <p className="gr-type-note gr-type-note--pr">
                  <span className="gr-type-note__dot gr-type-note__dot--gold" aria-hidden />
                  Tirage {currentPR.label} → prime de rareté ×{currentPR.multBonus.toFixed(2)} sur la valeur PSA 10
                </p>
              )}
              {currentPR?.block && (
                <p className="gr-type-note gr-type-note--warn">
                  <span className="gr-type-note__dot gr-type-note__dot--red" aria-hidden />
                  Carte 1/1 détectée — le calcul affichera pourquoi le grading n'est généralement pas recommandé
                </p>
              )}
            </div>

            <button type="submit" className="gr-btn">
              Calculer le ROI
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        </Reveal>

        {/* ── Result — 1/1 blocked ── */}
        {r?.blocked && (
          <Reveal>
            <div className="gr-result gr-result--blocked">
              <div className="gr-verdict">
                <span className="gr-verdict__badge">Ne pas grader</span>
                <span className="gr-verdict__roi">Carte 1/1</span>
              </div>
              <div className="gr-blocked-body">
                <p className="gr-blocked-reason">{r.blockReason}</p>
                <p className="gr-blocked-detail">{r.blockDetail}</p>
                <div className="gr-blocked-cost">
                  <span className="gr-blocked-cost__label">Coût évité</span>
                  <span className="gr-blocked-cost__val">{fmt(r.totalCost - Math.round(parseFloat(rawPrice)))}</span>
                  <span className="gr-blocked-cost__note">{r.svc.brand} {r.svc.tier} + envoi</span>
                </div>
              </div>
            </div>
          </Reveal>
        )}

        {/* ── Result — normal ── */}
        {r && !r.blocked && (
          <Reveal>
            <div className={`gr-result gr-result--${r.tone}`}>

              <div className="gr-verdict">
                <span className="gr-verdict__badge">{r.verdict}</span>
                <span className="gr-verdict__roi">
                  {r.roiPct > 0 ? "+" : ""}{r.roiPct}% ROI espéré
                </span>
                {r.pr.id !== "open" && (
                  <span className="gr-verdict__pr">tirage {r.pr.label}</span>
                )}
              </div>

              <div className="gr-stats">
                <div className="gr-stat">
                  <span className="gr-stat__label">Investissement total</span>
                  <span className="gr-stat__val">{fmt(r.totalCost)}</span>
                  <span className="gr-stat__note">raw · {r.svc.brand} {r.svc.tier} · envoi</span>
                </div>
                <div className="gr-stat">
                  <span className="gr-stat__label">Prix estimé si PSA/BGS 10</span>
                  <span className="gr-stat__val">{fmt(r.price10)}</span>
                  <span className="gr-stat__note">×{r.card.mult10}{r.pr.id !== "open" ? ` ×${r.pr.multBonus.toFixed(2)} (tirage)` : ""} · {r.svc.turnaround}</span>
                </div>
                <div className="gr-stat">
                  <span className="gr-stat__label">Valeur espérée pondérée</span>
                  <span className="gr-stat__val">{fmt(r.ev)}</span>
                  <span className="gr-stat__note">prob × prix par grade</span>
                </div>
                <div className="gr-stat gr-stat--roi">
                  <span className="gr-stat__label">ROI espéré</span>
                  <span className="gr-stat__val gr-stat__val--big">
                    {r.roiPct > 0 ? "+" : ""}{r.roiPct}%
                  </span>
                  <span className="gr-stat__note">valeur esp. vs coût total</span>
                </div>
              </div>

              <div className="gr-probs">
                <h3 className="gr-probs__title">Distribution de grades estimée</h3>
                <ProbBar label="PSA / BGS 10" pct={r.p10Pct} color="#4ade80" />
                <ProbBar label="PSA / BGS 9"  pct={r.p9Pct}  color="#fbbf24" />
                <ProbBar label="8 ou moins"   pct={Math.max(0, 100 - r.p10Pct - r.p9Pct)} color="#f87171" />
              </div>

              <p className="gr-disclaimer">
                Estimations heuristiques basées sur les données PSA 2024-2025. Les probabilités
                varient selon l&apos;état de surface, le centering et les corners. Inspecter avant d&apos;envoyer.
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
              Tarifs approximatifs USD→CAD (×1.37). Vérifier les prix actuels sur PSA.com et BGSGrading.com.
            </p>
          </div>
        </Reveal>

      </main>
    </div>
  );
}
