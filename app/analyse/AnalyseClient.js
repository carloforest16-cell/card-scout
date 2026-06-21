"use client";

/* eslint-disable @next/next/no-img-element -- images eBay dynamiques */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import CountUp from "../components/CountUp";
import Reveal from "../components/Reveal";
import ScoreGauge from "../components/ScoreGauge";
import ScrollProgress from "../components/ScrollProgress";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import { pushRecentPlayer } from "@/lib/useRecentPlayers";
import TiltCard from "../components/TiltCard";

function formatCad(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(x);
}

function verdictTone(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "buy";
  if (v.includes("passer") || v.includes("éviter") || v.includes("eviter"))
    return "avoid";
  return "watch";
}

function verdictBadgeClass(tone) {
  if (tone === "buy") return "cn-badge--profit";
  if (tone === "avoid") return "cn-badge--loss";
  return "cn-badge--gold";
}

const FACTOR_LABELS = {
  performance: "Performance",
  momentum: "Momentum",
  age: "Âge",
  marketValue: "Marché",
  liquidity: "Liquidité",
  upside: "Upside",
  hype: "Hype",
};

/** Animated factor bar — width grows on viewport entry. */
function FactorBar({ label, score }) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setW(Math.min(100, Number(score) * 10));
          obs.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [score]);
  return (
    <div className="cn-stat-row" ref={ref}>
      <span className="cn-stat-row__label">{label}</span>
      <span className="cn-stat-row__track">
        <span className="cn-stat-row__fill" style={{ width: `${w}%` }} />
      </span>
      <span className="cn-stat-row__val cn-mono">{(Number(score) || 0).toFixed(1)}</span>
    </div>
  );
}

/** Terminal-style projection chart. */
function ProjectionChart({ projection }) {
  const pts = projection?.points ?? [];
  if (pts.length < 2) return null;
  const W = 340;
  const H = 160;
  const padL = 44;
  const padR = 14;
  const padB = 26;
  const padT = 14;
  const lows = pts.map((p) => p.low);
  const highs = pts.map((p) => p.high);
  const minV = Math.min(...lows);
  const maxV = Math.max(...highs);
  const range = Math.max(1, maxV - minV);
  const x = (i) => padL + (i * (W - padL - padR)) / (pts.length - 1);
  const y = (v) => H - padB - ((v - minV) / range) * (H - padB - padT);
  const lowPts = pts.map((p, i) => `${x(i)},${y(p.low)}`);
  const highPts = pts.map((p, i) => `${x(i)},${y(p.high)}`);
  const area = `M ${highPts.join(" L ")} L ${[...lowPts].reverse().join(" L ")} Z`;
  const midPts = pts.map((p, i) => `${x(i)},${y(p.mid)}`).join(" ");
  return (
    <svg
      className="an-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Projection de prix estimée sur 5 ans"
    >
      <defs>
        <linearGradient id="an-chart-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#00D4FF" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#00D4FF" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="an-chart-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="100%" stopColor="#FFB800" />
        </linearGradient>
      </defs>
      {/* gridlines (terminal style) */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={padL}
          x2={W - padR}
          y1={padT + g * (H - padB - padT)}
          y2={padT + g * (H - padB - padT)}
          stroke="#1E293B"
          strokeWidth="1"
          strokeDasharray="2 4"
        />
      ))}
      <path d={area} fill="url(#an-chart-area)" stroke="none" />
      <polyline
        points={midPts}
        fill="none"
        stroke="url(#an-chart-line)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map((p, i) => (
        <g key={p.year}>
          <circle cx={x(i)} cy={y(p.mid)} r="3" fill="#05060A" stroke="#00D4FF" strokeWidth="1.6" />
          <text
            x={x(i)}
            y={H - 6}
            fill="#475569"
            fontSize="10"
            fontFamily="var(--cn-mono)"
            textAnchor="middle"
          >
            {p.year}
          </text>
        </g>
      ))}
      <text x={6} y={y(maxV) + 3} fill="#475569" fontSize="9.5" fontFamily="var(--cn-mono)">
        {Math.round(maxV)}$
      </text>
      <text x={6} y={y(minV) + 3} fill="#475569" fontSize="9.5" fontFamily="var(--cn-mono)">
        {Math.round(minV)}$
      </text>
    </svg>
  );
}

function PanelHead({ num, title, meta }) {
  return (
    <div className="an-panel-head">
      <span className="an-panel-head__num">{num}</span>
      <h3 className="cn-h3 an-panel-head__title">{title}</h3>
      {meta ? <span className="an-panel-head__meta">{meta}</span> : null}
    </div>
  );
}

function isEbayUrl(input) {
  try {
    const u = new URL(input);
    return /(^|\.)ebay\.[a-z.]+$/i.test(u.hostname);
  } catch { return false; }
}

export default function AnalyseClient() {
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") ?? "";
  const [url, setUrl] = useState(() => (isEbayUrl(initialUrl) ? initialUrl : ""));
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const autoSubmittedRef = useRef(false);

  // Mémoire visiteur : sauvegarde le joueur quand identifié par l'analyse
  useEffect(() => {
    const p = state.data?.player;
    if (p?.id && p?.name) {
      pushRecentPlayer({ id: p.id, name: p.name, headshotUrl: p.headshotUrl ?? null, team: p.team ?? null });
    }
  }, [state.data]);

  useEffect(() => {
    const prefilledUrl = searchParams.get("url");
    if (prefilledUrl && !autoSubmittedRef.current && isEbayUrl(prefilledUrl)) {
      autoSubmittedRef.current = true;
      setUrl(prefilledUrl);
      setState({ loading: true, data: null, error: null });
      fetch("/api/analyze-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: prefilledUrl }),
      })
        .then((r) => r.json().catch(() => null))
        .then((body) => {
          if (!body?.ok) setState({ loading: false, data: null, error: body?.error ?? "Analyse impossible." });
          else setState({ loading: false, data: body, error: null });
        })
        .catch(() => setState({ loading: false, data: null, error: "Erreur réseau." }));
    }
  }, [searchParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setState({ loading: true, data: null, error: null });
    try {
      const r = await fetch("/api/analyze-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const body = await r.json().catch(() => null);
      if (!body?.ok) {
        setState({
          loading: false,
          data: null,
          error: body?.error ?? "Analyse impossible.",
        });
        return;
      }
      setState({ loading: false, data: body, error: null });
    } catch {
      setState({ loading: false, data: null, error: "Erreur réseau." });
    }
  }

  const d = state.data;
  const tone = d?.verdict ? verdictTone(d.verdict.verdict) : "watch";
  const scoreVal = Number(d?.cardScout?.score) || 0;
  const scoreTone = verdictTone(d?.cardScout?.verdict);

  return (
    <div className="an-page cinematic">
      <ScrollProgress />
      <Atmosphere />

      <div className="an-rail">
        <div className="an-rail__inner">
          <AppNav active="analyse" />
        </div>
      </div>

      <main className="an-main">
        {/* ── HERO ── */}
        <Reveal as="header" className="an-hero">
          <p className="cn-eyebrow an-hero__eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            INTELLIGENCE · EBAY · TEMPS RÉEL
          </p>
          <h1 className="cn-h1 an-hero__title">
            DÉVERROUILLEZ <span className="cn-h1__ice">LA VÉRITÉ</span> DERRIÈRE UNE ANNONCE
          </h1>
          <p className="cn-body an-hero__sub">
            Collez une URL eBay. En quelques secondes, l&apos;intelligence Card Metrics
            décortique le joueur, la carte, le prix réel du marché et chaque
            opportunité moins chère. Aucune devinette. Juste de la data.
          </p>

          <form onSubmit={handleSubmit} className="an-search">
            <label htmlFor="an-url" className="cn-label" style={{ display: "block", marginBottom: "0.65rem" }}>
              URL DE L&apos;ANNONCE
            </label>
            <div className="an-search__field">
              <svg
                className="an-search__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <input
                id="an-url"
                type="url"
                inputMode="url"
                className="an-search__input"
                placeholder="https://www.ebay.ca/itm/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-label="URL de l'annonce eBay"
              />
              <button
                type="submit"
                className="an-search__btn"
                disabled={state.loading || !url.trim()}
              >
                {state.loading ? (
                  <>
                    <span className="an-search__btn-spin" aria-hidden />
                    ANALYSE
                  </>
                ) : (
                  <>ANALYSER →</>
                )}
              </button>
            </div>
            <p className="an-search__hint">→ FORMAT ATTENDU : PAGE D&apos;ANNONCE EBAY (CA, US, ETC.)</p>
          </form>

          {state.error ? (
            <div className="an-error" role="alert">
              <span aria-hidden>⨯</span>
              <span>{state.error}</span>
            </div>
          ) : null}
        </Reveal>

        {/* ── LOADING ── */}
        {state.loading ? (
          <div className="an-loading" aria-busy="true">
            <div className="an-skel an-skel--tall" />
            <div className="an-skel" />
            <div className="an-skel" />
          </div>
        ) : null}

        {/* ── RESULTS ── */}
        {d ? (
          <div className="an-result">
            {/* Verdict */}
            {d.verdict ? (
              <Reveal>
                <TiltCard className={`an-verdict-tilt an-verdict an-verdict--${tone}`}>
                  <div className="cn-card an-verdict">
                    <div className="an-verdict__head">
                      <span className={`cn-badge ${verdictBadgeClass(tone)}`}>
                        <span className="cn-badge__dot" aria-hidden />
                        {d.verdict.verdict}
                      </span>
                      <span className="cn-label an-verdict__caption">— VERDICT IA</span>
                    </div>
                    <p className="an-verdict__summary">{d.verdict.summary}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ) : null}

            {/* Sticky context (player name + price) */}
            {d.player || d.listing ? (
              <div className="an-context" aria-hidden>
                <span className="cn-eyebrow">
                  <span className="cn-eyebrow__dot" aria-hidden />
                  DOSSIER
                </span>
                <span className="an-context__lead">
                  {d.player ? <strong>{d.player.name}</strong> : <strong>Joueur non identifié</strong>}
                  {" · "}
                  <span className="cn-mono">{formatCad(d.listing.priceCad)}</span>
                </span>
                {d.verdict ? (
                  <span className={`cn-badge ${verdictBadgeClass(tone)}`}>
                    {d.verdict.verdict}
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* Annonce */}
            <Reveal index={1}>
              <TiltCard>
                <div className="cn-card">
                  <PanelHead num="01" title="L'annonce" meta="EBAY · BRUT" />
                  <div className="an-listing">
                    <div className="an-listing__media">
                      {d.listing.imageUrl ? (
                        <img src={d.listing.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="an-listing__ph" aria-hidden>◆</span>
                      )}
                    </div>
                    <div className="an-listing__body">
                      <h4 className="an-listing__title">{d.listing.title}</h4>
                      <div className="an-listing__price-row">
                        <span className="an-listing__price">{formatCad(d.listing.priceCad - d.listing.shippingCad)}</span>
                        <span className="an-listing__ship">
                          {d.listing.shippingCad > 0
                            ? `+ ${formatCad(d.listing.shippingCad)} PORT`
                            : "PORT INCLUS / GRATUIT"}
                        </span>
                      </div>
                      <div className="an-listing__tags">
                        {d.player ? (
                          <span className="an-tag">{d.player.name}</span>
                        ) : (
                          <span className="an-tag an-tag--warn">Joueur non identifié</span>
                        )}
                        {d.card?.group ? <span className="an-tag">{d.card.group}</span> : null}
                        {d.card?.grade ? <span className="an-tag">{d.card.grade}</span> : null}
                        {d.card?.year ? <span className="an-tag">{d.card.year}</span> : null}
                      </div>
                      {d.listing.url ? (
                        <a
                          className="an-link"
                          href={d.listing.url}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                        >
                          Voir l&apos;annonce sur eBay
                          <span className="an-link__arrow" aria-hidden>→</span>
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </TiltCard>
            </Reveal>

            {/* Joueur */}
            <Reveal index={2}>
              <TiltCard>
                <div className="cn-card">
                  <PanelHead num="02" title="Le joueur" meta="CARD METRICS SCORE" />
                  {d.cardScout ? (
                    <>
                      <div className="an-score-row">
                        <ScoreGauge score={scoreVal} label="SCORE / 10" size={220} />
                        <div className="an-score-meta">
                          <span className="cn-label">VERDICT JOUEUR</span>
                          {d.cardScout.verdict ? (
                            <span className={`cn-badge ${verdictBadgeClass(scoreTone)}`}>
                              <span className="cn-badge__dot" aria-hidden />
                              {d.cardScout.verdict}
                            </span>
                          ) : null}
                          <span
                            className={`an-score-meta__big ${scoreVal >= 7 ? "an-score-meta__big--high" : ""}`}
                          >
                            <CountUp value={scoreVal} decimals={1} duration={1500} />
                            <span className="cn-mono" style={{ fontSize: "0.7rem", color: "var(--ghost)", marginLeft: "0.5rem", letterSpacing: "0.1em" }}>
                              / 10
                            </span>
                          </span>
                        </div>
                      </div>
                      {d.cardScout.factors ? (
                        <div className="an-factors">
                          {Object.keys(FACTOR_LABELS).map((k) => {
                            const sc = Number(d.cardScout.factors?.[k]?.score);
                            if (!Number.isFinite(sc)) return null;
                            return <FactorBar key={k} label={FACTOR_LABELS[k]} score={sc} />;
                          })}
                        </div>
                      ) : null}
                      {d.cardScout.reasoning ? (
                        <p className="an-note">{d.cardScout.reasoning}</p>
                      ) : d.cardScout.mathOnly ? (
                        <p className="an-note an-muted">
                          Score mathématique uniquement — la narration IA est temporairement indisponible.
                        </p>
                      ) : null}
                    </>
                  ) : d.player ? (
                    <p className="an-muted">
                      Joueur identifié ({d.player.name}) — mais le score Card Metrics n&apos;a pas pu être calculé maintenant.
                      Le verdict prix reste disponible plus bas.
                    </p>
                  ) : (
                    <p className="an-muted">
                      Joueur non identifié dans le titre eBay. L&apos;analyse fonctionne quand même
                      pour le prix face au marché.
                    </p>
                  )}
                  {d.verdict?.playerVerdict ? (
                    <p className="an-note an-note--accent">{d.verdict.playerVerdict}</p>
                  ) : null}
                </div>
              </TiltCard>
            </Reveal>

            {/* Prix */}
            <Reveal index={3}>
              <TiltCard>
                <div className="cn-card">
                  <PanelHead
                    num="03"
                    title="Prix face au marché"
                    meta="ANNONCES ACTIVES"
                  />
                  {d.fairValue ? (
                    <>
                      <div className="an-bigstat">
                        <span className="an-bigstat__value">
                          <CountUp value={d.fairValue.fairValueCad} decimals={0} prefix="$" duration={1400} />
                        </span>
                        <span className="an-bigstat__unit">
                          {`EST. · ${d.fairValue.comps} COMPS`}
                        </span>
                      </div>
                      {d.fairValue.trusted ? (
                        <p className={`an-delta ${d.fairValue.deltaPct <= 0 ? "an-delta--good" : "an-delta--bad"}`}>
                          <span className="an-delta__arrow">{d.fairValue.deltaPct <= 0 ? "↓" : "↑"}</span>
                          {d.fairValue.deltaPct <= 0 ? "" : "+"}
                          {d.fairValue.deltaPct}% vs cote du marché
                        </p>
                      ) : (
                        <p className="an-muted" style={{ marginBottom: "1.25rem" }}>
                          Estimation indicative — peu de comparables.
                        </p>
                      )}
                      <p className="an-muted an-price-source">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, opacity: 0.5 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                        Basé sur annonces actives (prix demandés) — pas les ventes réelles.
                      </p>
                    </>
                  ) : (
                    <p className="an-muted">Pas assez d&apos;annonces comparables pour estimer la cote.</p>
                  )}
                  {d.verdict?.priceVerdict ? (
                    <p className="an-note an-note--accent">{d.verdict.priceVerdict}</p>
                  ) : null}
                </div>
              </TiltCard>
            </Reveal>

            {/* Tendance historique */}
            {d.player?.name ? (
              <Reveal index={4}>
                <TiltCard>
                  <div className="cn-card">
                    <PanelHead
                      num="04"
                      title="Tendance historique"
                      meta="SNAPSHOTS HEBDO"
                    />
                    <PriceHistoryChart
                      playerName={d.player.name}
                      cardType={d.card?.group}
                      months={6}
                    />
                  </div>
                </TiltCard>
              </Reveal>
            ) : null}

            {/* Projection */}
            {d.projection ? (
              <Reveal index={5}>
                <TiltCard>
                  <div className="cn-card">
                    <PanelHead num="05" title="Projection · 5 ans" meta="MODÈLE IA" />
                    <p className="an-proj-head">
                      Croissance annuelle estimée{" "}
                      <strong>
                        {d.projection.annualGrowthPct > 0 ? "+" : ""}
                        {d.projection.annualGrowthPct}%/an
                      </strong>
                      {" — environ "}
                      <strong>
                        {formatCad(d.projection.points[d.projection.points.length - 1].mid)}
                      </strong>
                      {" en "}
                      {d.projection.points[d.projection.points.length - 1].year}.
                    </p>
                    <div className="an-chart-wrap">
                      <ProjectionChart projection={d.projection} />
                    </div>
                    <p className="an-muted">
                      Modèle basé sur le profil joueur (score, âge, momentum) et le type de carte.
                      Indicatif — le marché reste volatil.
                    </p>
                  </div>
                </TiltCard>
              </Reveal>
            ) : null}

            {/* Type de carte */}
            {d.verdict?.cardVerdict ? (
              <Reveal index={6}>
                <TiltCard>
                  <div className="cn-card">
                    <PanelHead num={d.projection ? "06" : "05"} title="Le type de carte" meta="CONTEXTE" />
                    <p className="an-note">{d.verdict.cardVerdict}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ) : null}

            {/* Alternatives */}
            <Reveal index={7}>
              <TiltCard>
                <div className="cn-card">
                  <PanelHead
                    num={d.projection && d.verdict?.cardVerdict ? "07" : d.projection || d.verdict?.cardVerdict ? "06" : "05"}
                    title="Alternatives moins chères"
                    meta={`${d.alternatives.length} TROUVÉE${d.alternatives.length > 1 ? "S" : ""}`}
                  />
                  {d.alternatives.length === 0 ? (
                    <p className="an-muted">
                      Aucune annonce identique trouvée moins chère — bon signe pour ce prix.
                    </p>
                  ) : (
                    <ul className="an-alts">
                      {d.alternatives.map((a, i) => (
                        <li key={`${a.url}-${i}`} className="an-alt">
                          <div>
                            <span className="an-alt__price">{formatCad(a.priceCad)}</span>
                            <span className="an-alt__ship">
                              {a.shippingCad > 0
                                ? `+ ${formatCad(a.shippingCad)} port`
                                : "port inclus"}
                            </span>
                          </div>
                          <span className="an-alt__title">{a.title}</span>
                          {a.url ? (
                            <a className="an-link" href={a.url} target="_blank" rel="noopener noreferrer sponsored">
                              Voir <span className="an-link__arrow" aria-hidden>→</span>
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TiltCard>
            </Reveal>
          </div>
        ) : null}
      </main>
    </div>
  );
}
