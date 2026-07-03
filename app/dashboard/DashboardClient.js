/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { formatRelativeTime } from "@/lib/timeFormat";
import { toAffiliateUrl } from "@/lib/ebayAffiliate";

import Reveal from "../components/Reveal";
import Skeleton from "../components/Skeleton";

/* ─── Icons ─────────────────────────────────────────────────────────────── */
const IconArrow = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
const IconUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 17l10-10M9 7h8v8" />
  </svg>
);
const IconDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 7l10 10M9 17h8V9" />
  </svg>
);
const IconPulse = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12h4l3-9 4 18 3-9h4" />
  </svg>
);
const IconStar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1L12 2z" />
  </svg>
);
const IconBell = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
const IconInfo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

/* ─── Sparkline ─────────────────────────────────────────────────────────── */
function Sparkline({ data, seed = 1, color = "var(--cn-ice, #00D4FF)", width = 280, height = 64 }) {
  const points = useMemo(() => {
    const n = Array.isArray(data) && data.length > 0 ? data.length : 30;
    const raw = Array.isArray(data) && data.length > 0
      ? data
      : Array.from({ length: 30 }, (_, i) => 50 + Math.sin(i * 0.6 + seed) * 4 + (Math.random() - 0.5) * 3);
    const min = Math.min(...raw);
    const max = Math.max(...raw);
    const range = Math.max(1, max - min);
    return raw.map((p, i) => ({
      x: (i / Math.max(1, n - 1)) * width,
      y: height - ((p - min) / range) * (height - 8) - 4,
    }));
  }, [data, seed, width, height]);

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="dash-spark" aria-hidden>
      <defs>
        <linearGradient id={`spark-grad-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-grad-${seed})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Titre hero — mots qui montent, CSS pur (léger, pas framer-motion) ─── */
function SplitHeroTitle({ lead, name }) {
  return (
    <>
      <span className="dash-hero__split-mask">
        <span className="dash-hero__split-word" style={{ animationDelay: "0ms" }}>{lead}</span>
      </span>
      <span className="dash-hero__split-mask">
        <span className="dash-hero__split-word dash-hero__name" style={{ animationDelay: "90ms" }}>{name}</span>
      </span>
      <span className="dash-hero__period">.</span>
    </>
  );
}

/* ─── KPI card ──────────────────────────────────────────────────────────── */
function Kpi({ label, value, delta, deltaTone = "neutral", hint, icon, href }) {
  const Tag = href ? Link : "div";
  return (
    <Tag className={`dash-kpi${href ? " dash-kpi--link" : ""}`} href={href}>
      <div className="dash-kpi__top">
        <span className="dash-kpi__label">{label}</span>
        {icon && <span className="dash-kpi__icon">{icon}</span>}
      </div>
      <div className="dash-kpi__value">{value}</div>
      <div className="dash-kpi__bottom">
        {delta && (
          <span className={`dash-kpi__delta dash-kpi__delta--${deltaTone}`}>
            {deltaTone === "up" && <IconUp />}
            {deltaTone === "down" && <IconDown />}
            {delta}
          </span>
        )}
        {hint && <span className="dash-kpi__hint">{hint}</span>}
      </div>
    </Tag>
  );
}

/* ─── Coach IA — extrait 1 recommandation principale et actionnable ─────── */
function extractTopCoachTip(coach) {
  if (coach?.vendre?.[0]?.joueur) {
    return { tone: "loss", label: "VENDRE", text: `${coach.vendre[0].joueur} — ${coach.vendre[0].raison ?? ""}`.trim() };
  }
  if (coach?.garder?.[0]?.joueur) {
    return { tone: "profit", label: "GARDER", text: `${coach.garder[0].joueur} — ${coach.garder[0].raison ?? ""}`.trim() };
  }
  if (coach?.acheter?.[0]?.suggestion) {
    return { tone: "gold", label: "ACHETER", text: `${coach.acheter[0].suggestion} — ${coach.acheter[0].raison ?? ""}`.trim() };
  }
  if (coach?.resume) {
    return { tone: "ghost", label: "COACH", text: coach.resume };
  }
  return null;
}

/* ─── Deals détectés pour la watchlist (le plus actionnable) ────────────── */
function verdictTone(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "profit";
  if (v.includes("surveiller")) return "gold";
  if (v.includes("passer")) return "loss";
  return "ghost";
}

function WatchlistDealsWidget({ deals, loading, hasWatchlist }) {
  if (loading) {
    return (
      <div className="dash-card dash-deals">
        <div className="dash-card__head">
          <div>
            <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />POUR TES JOUEURS</p>
            <h2 className="dash-card__title">Deals détectés</h2>
          </div>
        </div>
        <ul className="dash-deals__list" aria-busy="true" aria-label="Chargement des deals">
          {[0, 1].map((i) => (
            <li key={i}>
              <div className="dash-deals__row" style={{ pointerEvents: "none" }}>
                <Skeleton variant="avatar" width={38} height={38} />
                <div className="dash-deals__info" style={{ gap: "0.4rem", display: "flex", flexDirection: "column" }}>
                  <Skeleton variant="text" width="55%" height={12} />
                  <Skeleton variant="text" width="35%" height={10} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!hasWatchlist) return null; // le vide watchlist est déjà couvert par WatchlistWidget

  if (!deals || deals.length === 0) {
    return (
      <div className="dash-card dash-deals">
        <div className="dash-card__head">
          <div>
            <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />POUR TES JOUEURS</p>
            <h2 className="dash-card__title">Deals détectés</h2>
          </div>
        </div>
        <p className="dash-empty">Aucun deal en cache pour tes joueurs en ce moment.</p>
        <Link href="/deals" className="dash-card__cta">
          Lancer une recherche <IconArrow />
        </Link>
      </div>
    );
  }

  return (
    <div className="dash-card dash-deals">
      <div className="dash-card__head">
        <div>
          <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />POUR TES JOUEURS</p>
          <h2 className="dash-card__title">Deals détectés</h2>
        </div>
        <Link href="/deals" className="dash-card__link">Deal Finder <IconArrow size={12} /></Link>
      </div>
      <ul className="dash-deals__list">
        {deals.map((d, i) => {
          const affiliateUrl = toAffiliateUrl(d.url) ?? d.url;
          const belowMarket = d.percentOfMarket != null && d.percentOfMarket < 100
            ? Math.round(100 - d.percentOfMarket)
            : null;
          return (
            <li key={`${d.playerId}-${i}`}>
              <a
                href={affiliateUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="dash-deals__row"
              >
                <div className="dash-deals__info">
                  <span className="dash-deals__name">{d.playerName}</span>
                  <span className="dash-deals__meta">{d.groupType}</span>
                </div>
                <div className="dash-deals__metric">
                  {d.verdict && (
                    <span className={`cn-badge cn-badge--${verdictTone(d.verdict)} dash-deals__badge`}>
                      <span className="cn-badge__dot" aria-hidden />
                      {d.verdict}
                    </span>
                  )}
                  <span className="dash-deals__price">
                    {d.priceCad != null ? `${Math.round(d.priceCad)}$` : "—"}
                  </span>
                  {belowMarket != null && belowMarket > 0 && (
                    <span className="dash-deals__delta">−{belowMarket}% vs cote</span>
                  )}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="dash-card__note">
        {deals[0]?.cachedAt
          ? `Détecté ${formatRelativeTime(deals[0].cachedAt)} · panel joueurs tendance.`
          : "Panel joueurs tendance."}
      </p>
    </div>
  );
}

/* ─── Followed players widget ───────────────────────────────────────────── */
function WatchlistWidget({ items, deltas, loading }) {
  if (!items || items.length === 0) {
    return (
      <div className="dash-card dash-watch">
        <div className="dash-card__head">
          <div>
            <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />JOUEURS SUIVIS</p>
            <h2 className="dash-card__title">Watchlist vide</h2>
          </div>
        </div>
        <p className="dash-empty">Suis des joueurs pour voir leurs scores ici.</p>
        <Link href="/" className="dash-card__cta">
          Explorer les joueurs <IconArrow />
        </Link>
      </div>
    );
  }

  const enriched = items.slice(0, 6).map((p) => {
    const info = deltas?.[String(p.player_id)];
    if (!info) {
      // Aucun score disponible pour ce joueur — état honnête, pas de chiffre inventé.
      return { ...p, dir: null, delta: null, score: "—", hasHistory: false };
    }
    const score = Number.isFinite(info.score) ? info.score.toFixed(1) : "—";
    if (!info.hasHistory) {
      // Score courant réel, mais pas encore d'historique 7j pour calculer une tendance.
      return { ...p, dir: null, delta: null, score, hasHistory: false };
    }
    const dir = info.direction === "down" ? "down" : info.direction === "flat" ? "flat" : "up";
    const delta = info.delta == null ? null : Math.abs(info.delta).toFixed(1);
    return { ...p, dir, delta, score, hasHistory: true };
  });

  const hasAnyHistory = enriched.some((e) => e.hasHistory);

  return (
    <div className="dash-card dash-watch">
      <div className="dash-card__head">
        <div>
          <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />JOUEURS SUIVIS</p>
          <h2 className="dash-card__title">Mouvements AI score</h2>
        </div>
        <Link href="/watchlist" className="dash-card__link">Tout voir <IconArrow size={12} /></Link>
      </div>
      <ul className="dash-watch__list">
        {enriched.map((p) => (
          <li key={p.id}>
            <Link href={`/player/${p.player_id}`} className="dash-watch__row">
              {p.headshot_url ? (
                <img src={p.headshot_url} alt="" className="dash-watch__avatar" />
              ) : (
                <span className="dash-watch__avatar dash-watch__avatar--ph" />
              )}
              <div className="dash-watch__info">
                <span className="dash-watch__name">{p.player_name}</span>
                <span className="dash-watch__meta">{p.player_team ?? "—"} · {p.player_position ?? "—"}</span>
              </div>
              <div className="dash-watch__metric">
                {loading ? (
                  <Skeleton variant="text" width={54} height={18} />
                ) : p.hasHistory ? (
                  <span className={`dash-watch__delta dash-watch__delta--${p.dir}`}>
                    {p.dir === "up" && <IconUp />}
                    {p.dir === "down" && <IconDown />}
                    {p.dir === "flat" || p.delta == null ? "±0" : `${p.dir === "up" ? "+" : "−"}${p.delta}`}
                  </span>
                ) : (
                  <span className="dash-watch__delta dash-watch__delta--flat">en observation</span>
                )}
                <span className="dash-watch__score">{loading ? "" : p.score}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="dash-card__note">
        {loading
          ? "Chargement des scores…"
          : hasAnyHistory ? "Variations sur 7 jours · snapshots Card Metrics." : "Scores actuels · historique 7 jours en cours de constitution."}
      </p>
    </div>
  );
}

/* Barre de progression honnête tant que l'historique réel (30j) n'est pas
   assez profond pour tracer une vraie courbe — pas de simulation. */
function TrackingProgress({ daysTracked = 0, target = 30 }) {
  const pct = Math.max(4, Math.min(100, (daysTracked / Math.max(1, target)) * 100));
  return (
    <div className="dash-port__progress">
      <div className="dash-port__progress-track">
        <div className="dash-port__progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="dash-port__progress-label">
        Historique en construction · jour {daysTracked}/{target}
      </span>
    </div>
  );
}

/* ─── Portfolio widget ──────────────────────────────────────────────────── */
function PortfolioWidget({ portfolio, totalInvested, valueSummary, sparkline, sparklineNote, daysTracked, daysTarget, summaryLoading, health, coachTip }) {
  const hasCards = portfolio.length > 0;
  const fmt = (n) => `$${Number(n || 0).toLocaleString("fr-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const hasRealValue = valueSummary && valueSummary.matchedCount > 0;
  const displayValue = hasRealValue ? valueSummary.totalCurrent : totalInvested;
  const pnlPct = hasRealValue ? valueSummary.pnlPct : null;
  const pnl = hasRealValue ? valueSummary.pnl : null;
  const pnlDir = pnlPct == null ? null : pnlPct > 0.5 ? "up" : pnlPct < -0.5 ? "down" : "flat";

  return (
    <div className="dash-card dash-port">
      <div className="dash-card__head">
        <div>
          <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />MON VAULT</p>
          <h2 className="dash-card__title">Valeur du portfolio</h2>
        </div>
        <Link href="/portfolio" className="dash-card__link">Détails <IconArrow size={12} /></Link>
      </div>

      {hasCards ? (
        <>
          <div className="dash-port__hero">
            <div>
              <div className="dash-port__value">{fmt(displayValue)} <span className="dash-port__ccy">CAD</span></div>
              <div className="dash-port__sub">
                {portfolio.length} carte{portfolio.length > 1 ? "s" : ""}
                {hasRealValue ? ` · ${valueSummary.matchedCount}/${valueSummary.cardsCount} valorisée${valueSummary.matchedCount > 1 ? "s" : ""}` : " · valeur d'achat"}
              </div>
            </div>
            {pnlDir && (
              <span className={`dash-port__pnl dash-port__pnl--${pnlDir}`}>
                {pnlDir === "up" && <IconUp />}
                {pnlDir === "down" && <IconDown />}
                {pnl > 0 ? "+" : ""}{fmt(pnl)} ({pnlPct > 0 ? "+" : ""}{pnlPct}%)
              </span>
            )}
            {!pnlDir && (
              <span className="dash-port__pill">Tracking · valorisation en cours</span>
            )}
          </div>
          {summaryLoading ? (
            <Skeleton variant="rect" width="100%" height={64} style={{ borderRadius: 8 }} />
          ) : sparklineNote === "real" && Array.isArray(sparkline) && sparkline.length > 0 ? (
            <>
              <Sparkline data={sparkline} seed={portfolio.length + 3} />
              <div className="dash-port__legend">
                <span>30 derniers jours</span>
                <span className="dash-port__legend-note">Historique réel — snapshots eBay</span>
              </div>
            </>
          ) : (
            <TrackingProgress daysTracked={daysTracked ?? 0} target={daysTarget ?? 30} />
          )}

          {/* Portfolio Health + Coach IA — lazy-load, rien tant que non résolu */}
          {health && (
            <div className="dash-port__health">
              <div className="dash-port__health-score">
                <span
                  className={`dash-port__health-num dash-port__health-num--${
                    health.score >= 70 ? "up" : health.score >= 40 ? "flat" : "down"
                  }`}
                >
                  {health.score}
                </span>
                <span className="dash-port__health-max">/100</span>
                <span className="dash-port__health-label">Santé du portfolio</span>
              </div>
              {coachTip && (
                <div className="dash-port__coach">
                  <span className={`cn-badge cn-badge--${coachTip.tone} dash-port__coach-badge`}>
                    <span className="cn-badge__dot" aria-hidden />
                    {coachTip.label}
                  </span>
                  <span className="dash-port__coach-text">{coachTip.text}</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="dash-empty">Aucune carte ajoutée. Construis ton vault pour suivre ta P&amp;L.</p>
          <Link href="/portfolio" className="dash-card__cta">
            Ajouter une carte <IconArrow />
          </Link>
        </>
      )}
    </div>
  );
}

/* ─── Opportunities widget ──────────────────────────────────────────────── */
function OpportunitiesWidget({ opps, loading }) {
  return (
    <div className="dash-card dash-opps">
      <div className="dash-card__head">
        <div>
          <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />À SUIVRE CETTE SEMAINE</p>
          <h2 className="dash-card__title">Picks de l&apos;IA</h2>
        </div>
        <Link href="/opportunites" className="dash-card__link">Top 10 <IconArrow size={12} /></Link>
      </div>

      {loading && (
        <ul className="dash-opps__list" aria-busy="true" aria-label="Chargement des opportunités">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <div className="dash-opps__row" style={{ pointerEvents: "none" }}>
                <Skeleton variant="rect" width={26} height={26} style={{ borderRadius: 8 }} />
                <Skeleton variant="avatar" width={38} height={38} />
                <div className="dash-opps__info" style={{ gap: "0.4rem", display: "flex", flexDirection: "column" }}>
                  <Skeleton variant="text" width="60%" height={12} />
                  <Skeleton variant="text" width="40%" height={10} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && opps.length === 0 && (
        <p className="dash-empty">Aucune opportunité disponible pour le moment.</p>
      )}

      {!loading && opps.length > 0 && (
        <ul className="dash-opps__list">
          {opps.slice(0, 4).map((o, i) => (
            <li key={o.playerId ?? i}>
              <Link href={`/player/${o.playerId}`} className="dash-opps__row">
                <span className="dash-opps__rank">{i + 1}</span>
                {o.headshotUrl ? (
                  <img src={o.headshotUrl} alt="" className="dash-opps__avatar" />
                ) : (
                  <span className="dash-opps__avatar dash-opps__avatar--ph" />
                )}
                <div className="dash-opps__info">
                  <span className="dash-opps__name">{o.name ?? o.playerName}</span>
                  <span className="dash-opps__meta">{o.team ?? "—"} · score {Number(o.score ?? 0).toFixed(1)}</span>
                </div>
                <span className="dash-opps__chev"><IconArrow size={14} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Market pulse widget (data-driven via summary endpoint) ────────────── */
function MarketPulseWidget({ items, loading }) {
  if (loading) {
    return (
      <div className="dash-card dash-pulse">
        <div className="dash-card__head">
          <div>
            <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />POULS DU MARCHÉ</p>
            <h2 className="dash-card__title">Tendances 7 jours</h2>
          </div>
        </div>
        <ul className="dash-pulse__list" aria-busy="true" aria-label="Chargement du pouls du marché">
          {[0, 1, 2].map((i) => (
            <li key={i} className="dash-pulse__row" style={{ pointerEvents: "none" }}>
              <Skeleton variant="rect" width={4} height={28} style={{ borderRadius: 4 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <Skeleton variant="text" width="50%" height={12} />
                <Skeleton variant="text" width="30%" height={10} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Pas de fallback inventé : si l'API n'a rien retourné (échec réseau, etc.),
  // on masque le widget plutôt que d'afficher des tendances de marché fictives.
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="dash-card dash-pulse">
      <div className="dash-card__head">
        <div>
          <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />POULS DU MARCHÉ</p>
          <h2 className="dash-card__title">Tendances 7 jours</h2>
        </div>
        <Link href="/pulse" className="dash-card__link">Live <IconPulse /></Link>
      </div>

      <ul className="dash-pulse__list">
        {items.map((it) => (
          <li key={it.label} className="dash-pulse__row">
            <div className="dash-pulse__bar" data-tone={it.tone} aria-hidden />
            <div className="dash-pulse__info">
              <span className="dash-pulse__label">{it.label}</span>
              <span className="dash-pulse__note">{it.note}</span>
            </div>
            <span className={`dash-pulse__trend dash-pulse__trend--${it.tone}`}>
              {it.tone === "up" && <IconUp />}
              {it.tone === "down" && <IconDown />}
              {it.trend}
            </span>
          </li>
        ))}
      </ul>

      <p className="dash-card__note">Estimations IA · panel ~75 joueurs analysés.</p>
    </div>
  );
}

/* ─── Onboarding (nouveau user) ─────────────────────────────────────────── */
function DashboardOnboarding({ displayName }) {
  const steps = [
    {
      href: "/",
      title: "Suis ton 1er joueur",
      desc: "Recherche un joueur et ajoute-le à ta watchlist pour suivre son AI score.",
      cta: "Explorer les joueurs",
      tone: "ice",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
        </svg>
      ),
    },
    {
      href: "/portfolio",
      title: "Ajoute ta 1ère carte",
      desc: "Construis ton vault pour suivre la valeur de ta collection en temps réel.",
      cta: "Ouvrir le Vault",
      tone: "gold",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M12 12v4M10 14h4" />
        </svg>
      ),
    },
    {
      href: "/watchlist",
      title: "Configure une alerte",
      desc: "Reçois une notif quand le prix d'une carte traverse ton seuil.",
      cta: "Créer une alerte",
      tone: "ice",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <Reveal as="header" className="dash-hero">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" />
          BIENVENUE SUR CARD METRICS
        </p>
        <h1 className="cn-h1 dash-hero__title">
          <SplitHeroTitle lead="Salut" name={displayName} />
        </h1>
        <p className="dash-hero__sub">
          3 actions pour démarrer et faire de ce tableau de bord ton hub d&apos;intelligence cartes NHL.
        </p>
      </Reveal>

      <div className="dash-onboard">
        {steps.map((s, i) => (
          <Reveal key={s.href} delay={0.1 + i * 0.08}>
            <Link href={s.href} className={`dash-onboard__card dash-onboard__card--${s.tone}`}>
              <div className="dash-onboard__step">Étape {i + 1}</div>
              <div className="dash-onboard__icon">{s.icon}</div>
              <h2 className="dash-onboard__title">{s.title}</h2>
              <p className="dash-onboard__desc">{s.desc}</p>
              <span className="dash-onboard__cta">
                {s.cta}
                <IconArrow size={14} />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.4}>
        <div className="dash-onboard__tip">
          <span className="dash-onboard__tip-label">ASTUCE</span>
          <span>Reviens ici à tout moment via le menu <strong>Dashboard</strong> en haut.</span>
        </div>
      </Reveal>
    </>
  );
}

/* ─── Feed d'activité (alertes + mouvements de score + notifications) ──── */
function ActivityFeedIcon({ kind }) {
  if (kind === "score") return <IconPulse />;
  if (kind === "alert") return <IconBell />;
  return <IconInfo />;
}

function ActivityFeedWidget({ items }) {
  // Source honnête : si rien à montrer (aucune alerte déclenchée, aucun
  // mouvement de score notable, aucune notification), on masque la section
  // plutôt que d'afficher un flux vide ou inventé.
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="dash-card dash-feed">
      <div className="dash-card__head">
        <div>
          <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />ACTIVITÉ RÉCENTE</p>
          <h2 className="dash-card__title">Ce qui a bougé</h2>
        </div>
      </div>
      <ul className="dash-feed__list">
        {items.map((it) => (
          <li key={it.id}>
            <Link href={it.link} className="dash-feed__row">
              <span className={`dash-feed__icon dash-feed__icon--${it.kind}`}>
                <ActivityFeedIcon kind={it.kind} />
              </span>
              <span className="dash-feed__text">{it.text}</span>
              <span className="dash-feed__time">{formatRelativeTime(it.timestamp)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── Recent searches strip (localStorage) ──────────────────────────────── */
function RecentSearches() {
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem("cs_recent_searches") ?? "[]");
      setRecent(Array.isArray(data) ? data.slice(0, 6) : []);
    } catch { /* */ }
  }, []);

  if (recent.length === 0) return null;

  return (
    <div className="dash-card dash-recent">
      <div className="dash-card__head">
        <div>
          <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />RECHERCHES RÉCENTES</p>
          <h2 className="dash-card__title">Reprendre l&apos;analyse</h2>
        </div>
      </div>
      <div className="dash-recent__strip">
        {recent.map((r) => (
          <Link key={r.id} href={`/player/${r.id}`} className="dash-recent__chip">
            {r.headshotUrl ? (
              <img src={r.headshotUrl} alt="" className="dash-recent__avatar" />
            ) : (
              <span className="dash-recent__avatar dash-recent__avatar--ph" />
            )}
            <span className="dash-recent__name">{r.name}</span>
            {r.team && <span className="dash-recent__team">{r.team}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── Main client ───────────────────────────────────────────────────────── */
export default function DashboardClient({ displayName, email, watchlist, portfolio, alerts, totalInvested }) {
  const [opps, setOpps] = useState([]);
  // Un seul flag pour tout /api/dashboard/summary — plusieurs widgets (pas
  // seulement Opportunités) en dépendent pour éviter un flash de placeholder.
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [oppsCount, setOppsCount] = useState(null);
  const [oppsGeneratedAt, setOppsGeneratedAt] = useState(null);
  const [deltas, setDeltas] = useState({});
  const [marketPulse, setMarketPulse] = useState(null);
  const [valueSummary, setValueSummary] = useState(null);
  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [watchlistDeals, setWatchlistDeals] = useState([]);
  const [watchlistDealsLoading, setWatchlistDealsLoading] = useState(true);
  const [dailyBrief, setDailyBrief] = useState(null);
  const [activityFeed, setActivityFeed] = useState([]);
  const [portfolioHealth, setPortfolioHealth] = useState(null);
  const [coachTip, setCoachTip] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/dashboard/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted || !data) return;
        setOpps(Array.isArray(data.opps) ? data.opps : []);
        setOppsCount(Number.isFinite(data.oppsCount) ? data.oppsCount : null);
        setOppsGeneratedAt(data.oppsGeneratedAt ?? null);
        setDeltas(data.deltas ?? {});
        setMarketPulse(Array.isArray(data.marketPulse) ? data.marketPulse : null);
        setWatchlistDeals(Array.isArray(data.watchlistDeals) ? data.watchlistDeals : []);
        setDailyBrief(typeof data.dailyBrief === "string" ? data.dailyBrief : null);
        setActivityFeed(Array.isArray(data.activityFeed) ? data.activityFeed : []);
        if (data.portfolioSummary) setPortfolioSummary(data.portfolioSummary);
      })
      .catch(() => { /* */ })
      .finally(() => { if (mounted) { setSummaryLoading(false); setWatchlistDealsLoading(false); } });

    if (portfolio.length > 0) {
      fetch("/api/portfolio/value")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!mounted || !data?.summary) return;
          setValueSummary(data.summary);

          // Coach IA — a besoin des valorisations par carte (values), donc
          // chaîné après /api/portfolio/value plutôt que lancé en parallèle.
          const values = Array.isArray(data.values) ? data.values : [];
          if (values.length === 0) return;
          fetch("/api/portfolio/coach", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ cards: portfolio, values }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((coach) => {
              if (!mounted || !coach) return;
              setCoachTip(extractTopCoachTip(coach));
            })
            .catch(() => { /* */ });
        })
        .catch(() => { /* */ });

      // Portfolio Health — indépendant du coach, lecture DB seule (rapide).
      fetch("/api/portfolio/health")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!mounted || !data?.ok || data.healthScore == null) return;
          setPortfolioHealth({
            score: data.healthScore,
            swapCount: Array.isArray(data.swapSuggestions) ? data.swapSuggestions.length : 0,
          });
        })
        .catch(() => { /* */ });
    }
    return () => { mounted = false; };
  }, [portfolio]);

  const lastVisit = useMemo(() => {
    const today = new Date();
    return today.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  }, []);

  const fmt = (n) => `$${Number(n || 0).toLocaleString("fr-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // Score moyen watchlist + delta 7j moyen — dérivés de `deltas` (déjà chargé),
  // uniquement à partir de scores/deltas réels.
  const watchlistScoreStats = useMemo(() => {
    const scores = [];
    const realDeltas = [];
    for (const w of watchlist) {
      const info = deltas[String(w.player_id)];
      if (!info || !Number.isFinite(info.score)) continue;
      scores.push(info.score);
      if (info.hasHistory && info.delta != null) realDeltas.push(info.delta);
    }
    if (scores.length === 0) return null;
    const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
    const avgDelta = realDeltas.length > 0
      ? realDeltas.reduce((s, v) => s + v, 0) / realDeltas.length
      : null;
    return { avgScore, avgDelta, hasAnyDelta: realDeltas.length > 0 };
  }, [watchlist, deltas]);

  // Prochain refresh du Top 10 — les crons opportunites tournent le 1er et
  // le 15 de chaque mois (pure math de date, aucune donnée requise).
  const nextOppsRefresh = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const candidates = [
      new Date(y, m, 1), new Date(y, m, 15),
      new Date(y, m + 1, 1), new Date(y, m + 1, 15),
    ];
    const next = candidates.find((c) => c > now);
    if (!next) return null;
    const daysLeft = Math.ceil((next.getTime() - now.getTime()) / 86400_000);
    return daysLeft <= 0 ? "aujourd'hui" : daysLeft === 1 ? "demain" : `dans ${daysLeft}j`;
  }, []);

  const isNewUser = watchlist.length === 0 && portfolio.length === 0 && alerts.length === 0;

  if (isNewUser) {
    return (
      <>
        <DashboardOnboarding displayName={displayName} />
        <footer className="dash-foot">
          <span>Connecté en tant que <strong>{email}</strong></span>
        </footer>
      </>
    );
  }

  return (
    <>
      {/* Hero compact */}
      <Reveal as="header" className="dash-hero">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" />
          TABLEAU DE BORD · {lastVisit.toUpperCase()}
        </p>
        <h1 className="cn-h1 dash-hero__title">
          <SplitHeroTitle lead="Bienvenue" name={displayName} />
        </h1>
        <p className="dash-hero__sub">
          {dailyBrief ?? "Voici ton intelligence du marché — portfolio, suivis et opportunités personnalisées."}
        </p>
      </Reveal>

      {/* KPI strip */}
      <Reveal className="dash-kpis" delay={0.1}>
        <Kpi
          label="Valeur portfolio"
          href="/portfolio"
          value={
            portfolio.length === 0
              ? "—"
              : fmt(valueSummary?.matchedCount > 0 ? valueSummary.totalCurrent : totalInvested)
          }
          delta={
            portfolio.length === 0
              ? "vide"
              : valueSummary?.matchedCount > 0
                ? `${valueSummary.pnlPct > 0 ? "+" : ""}${valueSummary.pnlPct}%`
                : "tracking actif"
          }
          deltaTone={
            valueSummary?.matchedCount > 0
              ? (valueSummary.pnlPct > 0.5 ? "up" : valueSummary.pnlPct < -0.5 ? "down" : "neutral")
              : "neutral"
          }
          hint={`${portfolio.length} carte${portfolio.length > 1 ? "s" : ""}`}
          icon={<IconStar />}
        />
        <Kpi
          label="Score moyen watchlist"
          href="/watchlist"
          value={watchlistScoreStats ? watchlistScoreStats.avgScore.toFixed(1) : "—"}
          delta={
            watchlistScoreStats?.hasAnyDelta
              ? `${watchlistScoreStats.avgDelta > 0 ? "+" : ""}${watchlistScoreStats.avgDelta.toFixed(1)} / 7j`
              : watchlist.length > 0 ? "en observation" : "—"
          }
          deltaTone={
            watchlistScoreStats?.hasAnyDelta
              ? (watchlistScoreStats.avgDelta > 0.05 ? "up" : watchlistScoreStats.avgDelta < -0.05 ? "down" : "neutral")
              : "neutral"
          }
          hint={`${watchlist.length} joueur${watchlist.length > 1 ? "s" : ""} suivis`}
        />
        <Kpi
          label="Alertes prix"
          href="/alertes"
          value={String(alerts.length)}
          delta={alerts.length > 0 ? `${alerts.length} active${alerts.length > 1 ? "s" : ""}` : "aucune"}
          deltaTone={alerts.length > 0 ? "up" : "neutral"}
          hint="seuils configurés"
        />
        <Kpi
          label="Prochain refresh picks"
          href="/opportunites"
          value={nextOppsRefresh ?? "—"}
          delta={oppsGeneratedAt ? `dernier : ${formatRelativeTime(oppsGeneratedAt)}` : "—"}
          deltaTone="neutral"
          hint={oppsCount != null ? `${oppsCount} opportunités top` : "opportunités top"}
        />
      </Reveal>

      {/* Le plus actionnable en premier : deals détectés pour la watchlist */}
      <Reveal delay={0.12}>
        <WatchlistDealsWidget
          deals={watchlistDeals}
          loading={watchlistDealsLoading}
          hasWatchlist={watchlist.length > 0}
        />
      </Reveal>

      {/* Row 1 : Watchlist + Portfolio */}
      <div className="dash-row dash-row--2">
        <Reveal delay={0.15}><WatchlistWidget items={watchlist} deltas={deltas} loading={summaryLoading} /></Reveal>
        <Reveal delay={0.2}>
          <PortfolioWidget
            portfolio={portfolio}
            totalInvested={totalInvested}
            valueSummary={valueSummary}
            sparkline={portfolioSummary?.sparkline30j}
            sparklineNote={portfolioSummary?.sparklineNote}
            daysTracked={portfolioSummary?.daysTracked}
            daysTarget={portfolioSummary?.daysTarget}
            summaryLoading={summaryLoading}
            health={portfolioHealth}
            coachTip={coachTip}
          />
        </Reveal>
      </div>

      {/* Row 2 : Opportunités + Marché */}
      <div className="dash-row dash-row--2">
        <Reveal delay={0.25}><OpportunitiesWidget opps={opps} loading={summaryLoading} /></Reveal>
        <Reveal delay={0.3}><MarketPulseWidget items={marketPulse} loading={summaryLoading} /></Reveal>
      </div>

      {/* Feed d'activité — se masque tout seul si rien de réel à montrer */}
      <Reveal delay={0.33}><ActivityFeedWidget items={activityFeed} /></Reveal>

      {/* Recent searches */}
      <Reveal delay={0.35}><RecentSearches /></Reveal>

      <footer className="dash-foot">
        <span>Connecté en tant que <strong>{email}</strong></span>
      </footer>
    </>
  );
}
