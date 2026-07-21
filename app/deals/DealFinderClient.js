"use client";

/* eslint-disable @next/next/no-img-element -- miniatures eBay tierces */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { pushRecentPlayer } from "@/lib/useRecentPlayers";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import CategoryIcon, { stripCategoryEmoji } from "../components/CategoryIcon";
import CountUp from "../components/CountUp";
import EmptyState from "../components/EmptyState";
import FastAddVaultModal from "../components/FastAddVaultModal";
import RefreshBar from "../components/RefreshBar";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";
import TiltCard from "../components/TiltCard";
import { useToast } from "../components/Toast";
import { usePreferences, useT } from "../components/PreferencesContext";

const SUGGESTED_PLAYERS = [
  "Connor McDavid",
  "Connor Bedard",
  "Cole Caufield",
  "Quinn Hughes",
  "Macklin Celebrini",
  "Shane Wright",
];

function formatScoredAgo(scoredAt, _tick, t) {
  if (!scoredAt) return "";
  const minutes = Math.floor((Date.now() - scoredAt) / 60000);
  if (minutes < 1) return t("deals.scored.justNow");
  return t("deals.scored.ago").replace("{min}", String(minutes));
}

const RECENT_KEY = "cs_recent_searches";
const RECENT_MAX = 8;

function readRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch { /* private mode */ }
}

/**
 * "dernière vente il y a N j" — null si date absente/illisible.
 * @param {string | null | undefined} dateStr - ISO "YYYY-MM-DD"
 */
function lastSaleLabel(dateStr, t) {
  if (!dateStr) return null;
  const ts = new Date(dateStr).getTime();
  if (!Number.isFinite(ts)) return null;
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  if (days === 0) return t("deals.comps.lastSaleToday");
  return t("deals.comps.lastSaleDays").replace("{n}", String(days));
}

function confidenceTooltip(confidence, comps, t) {
  const n = Number.isFinite(comps) ? comps : 0;
  switch (confidence) {
    case "high":
      return t("deals.confidence.high").replace("{n}", String(n));
    case "medium":
      return t("deals.confidence.medium").replace("{n}", String(n));
    case "low":
      return t("deals.confidence.low").replace("{n}", String(n));
    case "indicative":
      return t("deals.confidence.indicative");
    default:
      return t("deals.confidence.insufficient");
  }
}

/** @type {Array<{ id: string; label: string }>} */
const BUDGET_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "under5", label: "< 5$" },
  { id: "5-20", label: "5-20$" },
  { id: "20-50", label: "20-50$" },
  { id: "50-100", label: "50-100$" },
  { id: "100plus", label: "100$+" },
];

// Bornes du slider de prix. PRICE_MAX joue le rôle de « et plus » : quand
// maxPrice l'atteint, aucun plafond n'est appliqué.
const PRICE_MIN = 0;
const PRICE_MAX = 1000;

const DEFAULT_HOTTEST_FILTERS = {
  // Avant : 10 / 500 en dur, sans aucun contrôle UI — toute carte sous 10 $ ou
  // au-dessus de 500 $ était filtrée en silence, invisible et non réglable.
  minPrice: PRICE_MIN,
  maxPrice: PRICE_MAX,
  team: "all",
  cardType: "all",
  playerStage: "all",
  minScore: 5.0,
};

/** @type {Array<{ id: string; label: string; hint: string }>} */
const PLAYER_STAGE_OPTIONS = [
  { id: "all", label: "Tous", hint: "Tous les stades de carrière" },
  { id: "rookie", label: "Recrue", hint: "1re saison NHL" },
  { id: "young", label: "Jeune", hint: "23 ans et moins" },
  { id: "established", label: "Établi", hint: "24 à 29 ans" },
  { id: "veteran", label: "Vétéran", hint: "30 ans et plus" },
];

const NHL_TEAM_OPTIONS = [
  { id: "all", label: "Toutes" },
  { id: "ANA", label: "Anaheim Ducks" },
  { id: "BOS", label: "Boston Bruins" },
  { id: "BUF", label: "Buffalo Sabres" },
  { id: "CGY", label: "Calgary Flames" },
  { id: "CAR", label: "Carolina Hurricanes" },
  { id: "CHI", label: "Chicago Blackhawks" },
  { id: "COL", label: "Colorado Avalanche" },
  { id: "CBJ", label: "Columbus Blue Jackets" },
  { id: "DAL", label: "Dallas Stars" },
  { id: "DET", label: "Detroit Red Wings" },
  { id: "EDM", label: "Edmonton Oilers" },
  { id: "FLA", label: "Florida Panthers" },
  { id: "LAK", label: "Los Angeles Kings" },
  { id: "MIN", label: "Minnesota Wild" },
  { id: "MTL", label: "Montréal Canadiens" },
  { id: "NSH", label: "Nashville Predators" },
  { id: "NJD", label: "New Jersey Devils" },
  { id: "NYI", label: "New York Islanders" },
  { id: "NYR", label: "New York Rangers" },
  { id: "OTT", label: "Ottawa Senators" },
  { id: "PHI", label: "Philadelphia Flyers" },
  { id: "PIT", label: "Pittsburgh Penguins" },
  { id: "SJS", label: "San Jose Sharks" },
  { id: "SEA", label: "Seattle Kraken" },
  { id: "STL", label: "St. Louis Blues" },
  { id: "TBL", label: "Tampa Bay Lightning" },
  { id: "TOR", label: "Toronto Maple Leafs" },
  { id: "UTA", label: "Utah Mammoth" },
  { id: "VAN", label: "Vancouver Canucks" },
  { id: "VGK", label: "Vegas Golden Knights" },
  { id: "WSH", label: "Washington Capitals" },
  { id: "WPG", label: "Winnipeg Jets" },
];

const HOTTEST_CARD_TYPE_OPTIONS = [
  { id: "all", label: "Toutes" },
  { id: "young-guns", label: "Young Guns" },
  { id: "auto", label: "Auto/RPA" },
  { id: "canvas", label: "Canvas" },
  { id: "graded-psa", label: "Gradée PSA" },
  { id: "numbered", label: "Numéroté" },
  { id: "parallel", label: "Parallèle" },
];


const PLAYER_TEAM_BY_NAME = {
  "alex ovechkin": "WSH",
  "artemi panarin": "NYR",
  "auston matthews": "TOR",
  "brad marchand": "FLA",
  "brady tkachuk": "OTT",
  "claude giroux": "OTT",
  "cole caufield": "MTL",
  "cole perfetti": "WPG",
  "connor bedard": "CHI",
  "connor mcdavid": "EDM",
  "david pastrnak": "BOS",
  "ivan demidov": "MTL",
  "jack hughes": "NJD",
  "juraj slafkovsky": "MTL",
  "leon draisaitl": "EDM",
  "logan cooley": "UTA",
  "macklin celebrini": "SJS",
  "matvei michkov": "PHI",
  "matthew schaefer": "NYI",
  "matthew tkachuk": "FLA",
  "mitch marner": "TOR",
  "nathan mackinnon": "COL",
  "nick suzuki": "MTL",
  "nikita kucherov": "TBL",
  "quinton byfield": "LAK",
  "sam reinhart": "FLA",
  "sebastian aho": "CAR",
  "sidney crosby": "PIT",
  "tim stutzle": "OTT",
};

/**
 * @param {number} price
 * @param {string} budgetId
 * @returns {boolean}
 */
function trackEbayClick({ url, playerName, playerId, price }) {
  try {
    const listingId = extractEbayListingId(url);
    fetch("/api/ebay-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingUrl: url,
        listingId,
        playerName,
        playerId,
        priceCad: price,
        referrer: typeof window !== "undefined" ? window.location.pathname : null,
      }),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ });
  } catch { /* */ }
}

function extractEbayListingId(url) {
  if (!url) return null;
  try {
    const m = String(url).match(/\/itm\/(?:[^/]+\/)?(\d+)/);
    return m?.[1] ?? null;
  } catch { return null; }
}

function matchesBudget(price, budgetId) {
  const p = Number(price);
  if (!Number.isFinite(p)) return false;
  switch (budgetId) {
    case "under5":
      return p < 5;
    case "5-20":
      return p >= 5 && p <= 20;
    case "20-50":
      return p > 20 && p <= 50;
    case "50-100":
      return p > 50 && p <= 100;
    case "100plus":
      return p > 100;
    default:
      return true;
  }
}

function normalizePlayerName(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * L'équipe vient maintenant du serveur (`card.teamAbbrev`, issu des données NHL).
 * PLAYER_TEAM_BY_NAME ne sert plus que de repli pour les payloads en cache v5
 * qui n'ont pas encore le champ — sans ça, le filtre Équipe ne renverrait rien
 * pendant les 6 h de transition de cache.
 */
function teamMatchesCard(card, team) {
  if (team === "all") return true;
  const abbrev =
    card.teamAbbrev ?? PLAYER_TEAM_BY_NAME[normalizePlayerName(card.playerName)];
  return abbrev === team;
}

/**
 * Une carte au stade inconnu (données joueur manquantes) n'est jamais rangée
 * dans un bucket au hasard : elle sort des résultats dès qu'un stade précis est
 * demandé, et reste visible sous « Tous ».
 */
function playerStageMatchesCard(card, stage) {
  if (stage === "all") return true;
  return card.playerStage === stage;
}

function cardTypeMatchesCard(groupType, filter) {
  if (filter === "all") return true;
  const g = String(groupType ?? "");
  switch (filter) {
    case "young-guns":
      return g.includes("Young Guns");
    case "auto":
      return g.includes("Auto");
    case "canvas":
      return g.includes("Canvas");
    case "graded-psa":
      return g.includes("Gradée PSA");
    case "numbered":
      return g.includes("Numéroté");
    case "parallel":
      return g.includes("Parallèle");
    default:
      return g === filter;
  }
}

function formatCad(n) {
  try {
    return new Intl.NumberFormat("fr-CA", {
      style: "currency",
      currency: "CAD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n} $`;
  }
}

function formatScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return (Math.round(x * 10) / 10).toFixed(1);
}

const DL_WARNING_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

function detectCardWarnings(title) {
  const t = String(title ?? "");
  const warnings = [];
  if (/\b(Fan\s*Art|Fan\s*Made|Novelty|Homemade|Art\s+Card|Custom\s+Card|Not\s+Official)\b/i.test(t))
    warnings.push({ type: "fake", label: "Carte non officielle — fan art ou fabrication maison" });
  if (/\bMagnet\b/i.test(t))
    warnings.push({ type: "fake", label: "Aimant décoratif — pas une vraie carte" });
  if (/\b(Pick\s+Your|You\s+Pick|U\s+Pick|Choose\s+Your|Your\s+Choice|Pick\s+From)\b/i.test(t))
    warnings.push({ type: "lot", label: "Pick Your Card — vous choisissez parmi plusieurs cartes" });
  if (/\b(Read\s+Descri[a-z]*)\b/i.test(t))
    warnings.push({ type: "fake", label: "Annonce non standard — vérifiez avant d'acheter" });
  if (/\bJumbo\b/i.test(t))
    warnings.push({ type: "jumbo", label: "Format Jumbo — version surdimensionnée, pas la carte standard" });
  if (/\b(Oversized|Oversize)\b/i.test(t))
    warnings.push({ type: "jumbo", label: "Format surdimensionné — pas la carte standard" });
  return warnings;
}

function scoreColor(score) {
  const s = Number(score);
  if (s >= 8) return "var(--ice)";
  if (s >= 6.5) return "#f5c842";
  return "#e05252";
}

function PriceAlertModal({ playerId, playerName, suggestedPrice, onClose }) {
  const [maxPrice, setMaxPrice] = useState(String(suggestedPrice ?? ""));
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    const n = Number(maxPrice);
    if (!Number.isFinite(n) || n <= 0) {
      setStatus({ type: "error", msg: "Entre un prix valide" });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId, playerName, maxPriceCad: n }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        setStatus({ type: "error", msg: "Connecte-toi pour créer une alerte" });
      } else if (!res.ok) {
        setStatus({ type: "error", msg: data?.error ?? "Erreur" });
      } else {
        setStatus({ type: "ok", msg: "Alerte créée !" });
        setTimeout(onClose, 1200);
      }
    } catch {
      setStatus({ type: "error", msg: "Erreur réseau" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fav-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sdm-modal" role="dialog" aria-modal="true" aria-label="Créer une alerte prix" onSubmit={submit} style={{ maxWidth: 420 }}>
        <button type="button" className="fav-close sdm-close" onClick={onClose} aria-label="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
        <div style={{ padding: "1.5rem 1rem 0.5rem" }}>
          <p className="cn-eyebrow"><span className="cn-eyebrow__dot" aria-hidden />ALERTE PRIX</p>
          <h3 className="sdm-title" style={{ marginTop: "0.5rem" }}>{playerName}</h3>
          <p className="sdm-reason__text" style={{ marginTop: "0.5rem", marginBottom: "1.25rem" }}>
            On t&apos;envoie un email dès qu&apos;une carte de ce joueur descend sous ton prix max.
          </p>
          <label className="cn-label" htmlFor="alert-max-price" style={{ display: "block", marginBottom: "0.5rem" }}>
            PRIX MAX (CAD)
          </label>
          <input
            id="alert-max-price"
            type="number"
            inputMode="decimal"
            min="1"
            step="1"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="dl-input"
            style={{ width: "100%", padding: "0.6rem 0.8rem", marginBottom: "1rem" }}
            autoFocus
          />
          {status && (
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: status.type === "ok" ? "var(--profit)" : "var(--loss, #f58282)" }}>
              {status.msg}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button type="button" className="dl-vault-btn" onClick={onClose} style={{ flex: 1 }}>
              Annuler
            </button>
            <button type="submit" className="cn-btn cn-btn--solid" disabled={submitting} style={{ flex: 1.5 }}>
              {submitting ? "..." : "Créer l'alerte"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Singleton overlay DOM node piloté par dispatchZoom() — évite les bugs
// removeChild liés à une portal React conditionnelle qui se démonte vite.
let __zoomEl = null;
function ensureZoomEl() {
  if (typeof document === "undefined") return null;
  if (__zoomEl) return __zoomEl;
  __zoomEl = document.createElement("img");
  __zoomEl.className = "dl-zoom-overlay";
  __zoomEl.alt = "";
  __zoomEl.style.display = "none";
  document.body.appendChild(__zoomEl);
  return __zoomEl;
}
function showZoom(src, rect) {
  const el = ensureZoomEl();
  if (!el) return;
  const ZW = 380;
  const margin = 12;
  const right = rect.right + margin + ZW;
  const left = right < window.innerWidth ? rect.right + margin : rect.left - margin - ZW;
  const top = Math.max(8, Math.min(window.innerHeight - ZW - 8, rect.top));
  el.src = src;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  el.style.display = "block";
}
function hideZoom() {
  if (__zoomEl) __zoomEl.style.display = "none";
}

function HoverZoom({ src, alt = "" }) {
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    hideZoom();
  }, []);

  function onEnter(e) {
    if (typeof window === "undefined") return;
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => showZoom(src, rect), 200);
  }

  function onLeave() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    hideZoom();
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    />
  );
}

/**
 * Narratif déterministe sur la catégorie de carte (pourquoi elle prend — ou non
 * — de la valeur). Reprend la hiérarchie du prompt de scoring, sans coût IA.
 */
function cardTypeNarrative(groupType, title) {
  const gt = String(groupType ?? "");
  const ti = String(title ?? "");
  const numbered = /\/\s?\d{1,3}\b/.test(ti) || /numéroté|numbered/i.test(ti);

  if (/Auto|RPA|Patch|Cup|Signature|Ink|Signé/i.test(gt) || /\bauto\b|patch|rpa|signature/i.test(ti)) {
    return { text: "Auto / patch numéroté — le sommet de la hiérarchie : rare, très liquide, la catégorie qui s'apprécie le plus à long terme.", tone: "good" };
  }
  if (/Young Guns|YG/i.test(gt) || /young guns/i.test(ti)) {
    return { text: "Young Guns RC — la recrue flagship d'Upper Deck : demande constante, marché large, pilier de tout portefeuille hockey.", tone: "good" };
  }
  if (/Grad|PSA|BGS|SGC/i.test(gt) || /\b(psa|bgs|sgc)\s?\d/i.test(ti)) {
    return { text: "Carte gradée — note certifiée : liquidité supérieure et prime de grade justifiée quand la note est haute.", tone: "good" };
  }
  if (/Canvas|SP\b/i.test(gt)) {
    return { text: "Canvas / SP — insert de collection recherché, mais moins liquide qu'un Young Guns : bon complément, pas une pièce maîtresse.", tone: "neutral" };
  }
  if (/Parall|Prizm|Rainbow|Refractor/i.test(gt)) {
    return { text: "Parallèle — variante colorée : intéressante si numérotée basse, sinon liquidité limitée sauf gros rabais.", tone: "neutral" };
  }
  if (numbered) {
    return { text: "Carte numérotée — la rareté soutient la valeur : plus le tirage est bas, plus la demande est forte.", tone: "good" };
  }
  if (gt) {
    return { text: `${gt} — évaluer la rareté et la demande réelle avant d'acheter.`, tone: "neutral" };
  }
  return null;
}

/**
 * Décompose le score en 3 axes lisibles (joueur / prix vs marché / type de
 * carte) à partir des données déjà présentes — aucun appel IA supplémentaire.
 */
function buildScoreFactors(d, player) {
  const factors = [];

  // 1. Le joueur
  if (player && (player.cardMetricsScore != null || player.ageYears != null)) {
    const cms = player.cardMetricsScore;
    let quality;
    if (cms != null) {
      quality = cms >= 8 ? "joueur élite" : cms >= 6.5 ? "joueur de haut niveau" : cms >= 5 ? "joueur solide" : "profil plus risqué";
    } else {
      quality = "profil à évaluer";
    }
    const bits = [];
    if (player.ageYears != null) bits.push(`${player.ageYears} ans`);
    if (player.position) bits.push(player.position);
    if (player.pointsPerGame != null) bits.push(`${player.pointsPerGame} pts/match`);
    let form = "";
    if (player.recentFormPpg != null && player.pointsPerGame != null && player.pointsPerGame > 0) {
      if (player.recentFormPpg > player.pointsPerGame * 1.15) form = " · en feu récemment";
      else if (player.recentFormPpg < player.pointsPerGame * 0.7) form = " · froid récemment";
    }
    const scoreStr = cms != null ? ` — Score joueur ${Number(cms).toFixed(1)}/10` : "";
    const name = player.fullName || d.playerName || "";
    const lead = name ? `${name}${bits.length ? `, ${bits.join(" · ")}` : ""}` : (bits.length ? bits.join(" · ") : "Profil");
    factors.push({
      key: "player",
      icon: "player",
      label: "Le joueur",
      text: `${lead} : ${quality}${scoreStr}${form}.`,
      tone: cms != null ? (cms >= 6.5 ? "good" : cms >= 4.5 ? "neutral" : "bad") : "neutral",
    });
  }

  // 2. Le prix vs marché
  const pct = d.percentOfMarket;
  const delta = d.dealDeltaPct;
  if (pct != null) {
    let text, tone;
    const deltaStr = delta != null ? ` (${delta > 0 ? "+" : ""}${delta}%)` : "";
    if (pct <= 80) { text = `${formatCad(d.price)} = ${pct}% de la cote${deltaStr} — nettement sous le marché, fenêtre d'achat rare.`; tone = "good"; }
    else if (pct <= 92) { text = `${formatCad(d.price)} = ${pct}% de la cote${deltaStr} — sous le marché, bon rapport qualité/prix.`; tone = "good"; }
    else if (pct <= 108) { text = `${formatCad(d.price)} = ${pct}% de la cote — aligné sur le marché, prix juste.`; tone = "neutral"; }
    else { text = `${formatCad(d.price)} = ${pct}% de la cote${deltaStr} — au-dessus du marché, à négocier.`; tone = "bad"; }
    factors.push({ key: "price", icon: "price", label: "Le prix", text, tone });
  } else {
    factors.push({ key: "price", icon: "price", label: "Le prix", text: "Pas assez de ventes comparables pour situer ce prix face au marché — à comparer manuellement.", tone: "neutral" });
  }

  // 3. Le type de carte
  const cardNarr = cardTypeNarrative(d.groupType || d.groupDisplayName, d.title);
  if (cardNarr) {
    factors.push({ key: "card", icon: "card", label: "Le type de carte", text: cardNarr.text, tone: cardNarr.tone });
  }

  return factors;
}

function FactorIcon({ name }) {
  if (name === "player") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M6 21v-1a6 6 0 0 1 12 0v1" />
      </svg>
    );
  }
  if (name === "price") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V3h10l7.59 7.59a2 2 0 0 1 0 2.82Z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

function ScoreDetailModal({ d, player = null, onClose }) {
  const t = useT();
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const score = Number(d.investmentScore);
  const pct = d.percentOfMarket;
  const delta = d.dealDeltaPct;
  const factors = buildScoreFactors(d, player);

  const upsideIcon = d.upside === "Fort" ? "↑" : d.upside === "Faible" ? "↓" : "→";

  return (
    <div
      className="fav-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sdm-modal" role="dialog" aria-modal="true" aria-label="Détail du score">
        <button type="button" className="fav-close sdm-close" onClick={onClose} aria-label="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <div className="sdm-top">
          <div className="sdm-score-hero">
            <div className="sdm-score-ring" style={{ "--score-color": scoreColor(score) }}>
              <span className="sdm-score-num">{formatScore(score)}</span>
              <span className="sdm-score-denom">/10</span>
            </div>
            <span className={`cn-badge ${verdictBadgeClass(d.verdict)}`}>
              <span className="cn-badge__dot" aria-hidden />
              {d.verdict}
            </span>
          </div>
          {d.groupDisplayName && (
            <p className="sdm-group">
              <CategoryIcon type={d.groupDisplayName} size={14} className="sdm-group__icon" />
              {stripCategoryEmoji(d.groupDisplayName)}
            </p>
          )}
          <p className="sdm-title">{d.title}</p>
        </div>

        {d.reason && (
          <div className="sdm-reason">
            <p className="sdm-reason__label">L&apos;essentiel</p>
            <p className="sdm-reason__text">{d.reason}</p>
          </div>
        )}

        {factors.length > 0 && (
          <div className="sdm-why">
            <p className="sdm-why__label">Pourquoi ce score</p>
            <ul className="sdm-why__list">
              {factors.map((f) => (
                <li key={f.key} className={`sdm-why__row sdm-why__row--${f.tone}`}>
                  <span className="sdm-why__icon" aria-hidden>
                    <FactorIcon name={f.icon} />
                  </span>
                  <span className="sdm-why__body">
                    <span className="sdm-why__row-label">{f.label}</span>
                    <span className="sdm-why__text">{f.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="sdm-stats">
          <div className="sdm-stat">
            <span className="sdm-stat__label">PRIX</span>
            <span className="sdm-stat__val">{formatCad(d.price)}</span>
          </div>
          {d.fairValueCad != null && (
            <div className="sdm-stat">
              <span className="sdm-stat__label">COTE MARCHÉ</span>
              <span className="sdm-stat__val">{formatCad(d.fairValueCad)}</span>
            </div>
          )}
          {delta != null && (
            <div className="sdm-stat">
              <span className="sdm-stat__label">VS MARCHÉ</span>
              <span className="sdm-stat__val" style={{ color: delta <= -10 ? "var(--ice)" : delta >= 10 ? "#e05252" : "var(--silver)" }}>
                {delta > 0 ? "+" : ""}{delta}%
              </span>
            </div>
          )}
          <div className="sdm-stat">
            <span className="sdm-stat__label">HOLD</span>
            <span className="sdm-stat__val">{d.holdTimeline || "—"}</span>
          </div>
          <div className="sdm-stat">
            <span className="sdm-stat__label">UPSIDE</span>
            <span className="sdm-stat__val">{upsideIcon} {d.upside || "—"}</span>
          </div>
        </div>

        {pct != null && (
          <div className="sdm-bar-wrap">
            <div className="sdm-bar-labels">
              <span>Prix demandé</span>
              <span>{pct}% de la cote</span>
            </div>
            <div className="sdm-bar-track">
              <div
                className="sdm-bar-fill"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  background: pct <= 90 ? "var(--ice)" : pct <= 110 ? "#f5c842" : "#e05252",
                }}
              />
              <div className="sdm-bar-marker" style={{ left: "100%" }} />
            </div>
            <div className="sdm-bar-hint">
              <span>{pct <= 90 ? "Sous la cote — bon deal" : pct <= 110 ? "Proche de la cote" : "Au-dessus de la cote"}</span>
            </div>
          </div>
        )}

        {d.fairValueSource === "130point" && Array.isArray(d.comps130) && d.comps130.length > 0 && (
          <div className="sdm-comps">
            <p className="sdm-comps__title">{t("deals.comps.title")}</p>
            {d.fairValueRange?.p25Cad != null && d.fairValueRange?.p75Cad != null && (
              <p className="sdm-comps__range cn-mono">
                {t("deals.comps.range")
                  .replace("{p25}", formatCad(d.fairValueRange.p25Cad))
                  .replace("{p75}", formatCad(d.fairValueRange.p75Cad))}
                {lastSaleLabel(d.fairValueLastSale, t) && (
                  <span className="sdm-comps__fresh"> · {lastSaleLabel(d.fairValueLastSale, t)}</span>
                )}
              </p>
            )}
            <table className="sdm-comps__table">
              <thead>
                <tr>
                  <th>{t("deals.comps.date")}</th>
                  <th>{t("deals.comps.price")}</th>
                </tr>
              </thead>
              <tbody>
                {d.comps130.slice(0, 8).map((c, i) => (
                  <tr key={`${c.date}-${i}`}>
                    <td>{c.date || "—"}</td>
                    <td>{formatCad(c.priceCad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {d.url && (
          <a
            className="sdm-cta"
            href={d.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => trackEbayClick({ url: d.url, playerName: d.playerName, playerId: d.playerId, price: d.priceCad })}
          >
            Voir sur eBay →
          </a>
        )}
      </div>
    </div>
  );
}

function verdictBadgeClass(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "cn-badge--profit";
  if (v.includes("passer") || v.includes("éviter") || v.includes("eviter"))
    return "cn-badge--loss";
  if (v.includes("chercher")) return "cn-badge--gold";
  return "cn-badge--gold";
}

function Sparkline({ score, seed }) {
  const s = Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 5;
  const W = 60, H = 24, pts = 7;
  const rand = (i) => {
    const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const noise = Array.from({ length: pts }, (_, i) => rand(i));
  const trend = s / 10;
  const raw = noise.map((n, i) => trend * 0.6 + n * 0.4 + (i / (pts - 1)) * trend * 0.4);
  const mn = Math.min(...raw), mx = Math.max(...raw);
  const norm = raw.map((v) => (mx === mn ? 0.5 : (v - mn) / (mx - mn)));
  const points = norm.map((v, i) => [
    (i / (pts - 1)) * W,
    H - 4 - v * (H - 8),
  ]);
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fillPts = [...points, [W, H], [0, H]];
  const fill = fillPts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + "Z";
  const color = s >= 7 ? "#4ade80" : s >= 5 ? "#00d4ff" : "#f87171";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="dl-sparkline">
      <defs>
        <linearGradient id={`sg-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg-${seed})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {object} props.d
 * @param {boolean} [props.showPlayerChip]
 * @param {number} [props.index]
 */
function DealCard({ d, player = null, showPlayerChip, index = 0, watchedIds = new Set(), onToggleWatch = () => {}, alternatives = [] }) {
  const t = useT();
  const score = Number(d.investmentScore);
  const isHigh = Number.isFinite(score) && score >= 7;
  const [vaultOpen, setVaultOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const isChercher = String(d.verdict ?? "").toLowerCase().includes("chercher");
  const isAcheter = String(d.verdict ?? "").toLowerCase().includes("acheter");
  // Économie en $ vs la cote : plus punchy que « -31% » pour la conversion.
  // On n'affiche QUE si la cote est fiable (dealDeltaPct != null) et que le prix
  // est effectivement sous la cote (deal réel, pas ex-æquo).
  const savingsCad =
    d.dealDeltaPct != null && d.dealDeltaPct <= -5 && Number(d.fairValueCad) > 0 && Number(d.price) > 0
      ? Math.round(Number(d.fairValueCad) - Number(d.price))
      : null;
  // Badges de hiérarchie : le #1 en or, les 2-3 un chip discret. Placés en ligne
  // avec le verdict dans le body (plus dans le média — collision avec le nom).
  const rankBadge =
    index === 0 ? { cls: "dl-card__rank--hero", label: "MEILLEUR DEAL" }
    : index <= 2 ? { cls: "dl-card__rank--top", label: "TOP 3" }
    : null;

  return (
    <Reveal index={index}>
      <TiltCard className="dl-card-tilt">
        <article className="cn-card dl-card">
          <div className="dl-card__media">
            <WatchlistHeart
              playerId={d.playerId}
              playerName={d.playerName}
              watchedIds={watchedIds}
              onToggle={onToggleWatch}
            />
            {showPlayerChip && d.playerName ? (
              d.playerId ? (
                <a className="dl-card__chip" href={`/player/${d.playerId}`}>
                  {d.playerName}
                </a>
              ) : (
                <span className="dl-card__chip">{d.playerName}</span>
              )
            ) : null}
            <button
              type="button"
              className={`dl-card__score cn-mono${isHigh ? " dl-card__score--high" : ""} dl-card__score--btn`}
              onClick={() => setScoreOpen(true)}
              aria-label={`Score ${formatScore(d.investmentScore)}/10 — voir l'analyse`}
              title="Voir l'analyse du score"
            >
              <span className="dl-card__score-main">
                <span className="dl-card__score-eyebrow">SCORE</span>
                <span className="dl-card__score-num">
                  {formatScore(d.investmentScore)}
                  <span className="dl-card__score-denom">/10</span>
                </span>
              </span>
              <span className="dl-card__score-cta" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                Analyse
              </span>
            </button>
            {d.url ? (
              <a
                className="dl-card__media-link"
                href={d.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                aria-label={`eBay — ${String(d.title).slice(0, 80)}`}
              >
                {d.imageUrl ? (
                  <HoverZoom src={d.imageUrl} />
                ) : (
                  <span className="dl-card__ph" aria-hidden>
                    ◆
                  </span>
                )}
              </a>
            ) : d.imageUrl ? (
              <span className="dl-card__media-link">
                <HoverZoom src={d.imageUrl} />
              </span>
            ) : (
              <span className="dl-card__ph" aria-hidden>
                ◆
              </span>
            )}
          </div>

          <div className="dl-card__body">
            <div className="dl-card__badges">
              <span className={`cn-badge ${verdictBadgeClass(d.verdict)}`}>
                <span className="cn-badge__dot" aria-hidden />
                {d.verdict}
              </span>
              {rankBadge ? (
                <span className={`dl-card__rank ${rankBadge.cls}`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2l2.4 6.6L21 9l-5 4.6L17.4 21 12 17.3 6.6 21 8 13.6 3 9l6.6-.4L12 2z" />
                  </svg>
                  {rankBadge.label}
                </span>
              ) : null}
            </div>

            {d.groupDisplayName ? (
              <p className="dl-card__group cn-label">
                <CategoryIcon type={d.groupDisplayName} size={14} className="dl-card__group-icon" />
                {stripCategoryEmoji(d.groupDisplayName)}
              </p>
            ) : null}

            <h3 className="dl-card__title">{d.title}</h3>

            {detectCardWarnings(d.title).map((w, i) => (
              <div key={i} className={`card-warning card-warning--${w.type}`}>
                {DL_WARNING_ICON}
                <span>{w.label}</span>
              </div>
            ))}

            <p className="dl-card__meta cn-mono">
              <span>HOLD · {d.holdTimeline || "—"}</span>
              <span className="dl-card__meta-dot" aria-hidden>
                ·
              </span>
              <span>UPSIDE · {d.upside || "—"}</span>
            </p>

            {d.reason ? <p className="dl-card__reason">{d.reason}</p> : null}

            {isChercher && alternatives.length > 0 && (
              <div className="dl-card__alternatives">
                <p className="dl-card__alt-label cn-mono">ALTERNATIVES MOINS CHÈRES</p>
                {alternatives.map((alt, i) => (
                  <a
                    key={i}
                    href={alt.url}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className="dl-card__alt-row"
                  >
                    <span className="dl-card__alt-title">{String(alt.title ?? "").slice(0, 55)}{alt.title?.length > 55 ? "…" : ""}</span>
                    <span className="dl-card__alt-price">{formatCad(alt.price)}</span>
                  </a>
                ))}
              </div>
            )}

            <div className="dl-card__price-row">
              <span className="dl-card__price">{formatCad(d.price)}</span>
              {savingsCad != null && savingsCad >= 3 ? (
                <span className="dl-card__savings" title={`Prix ${d.dealDeltaPct}% sous la cote médiane`}>
                  −{formatCad(savingsCad)}
                </span>
              ) : (
                <Sparkline score={Number(d.investmentScore)} seed={Math.abs(String(d.title ?? "x").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 1000)} />
              )}
            </div>

            {d.fairValueCad != null ? (
              <p className="dl-card__fair-value cn-mono">
                Cote : {formatCad(d.fairValueCad)}
                {d.dealDeltaPct != null && (
                  <span className={`dl-card__delta ${d.dealDeltaPct <= -10 ? "dl-card__delta--good" : d.dealDeltaPct >= 10 ? "dl-card__delta--bad" : ""}`}>
                    {d.dealDeltaPct > 0 ? "+" : ""}{d.dealDeltaPct}%
                  </span>
                )}
                <span className="dl-card__price-source">
                  <span
                    className={`dl-card__conf dl-card__conf--${d.fairValueConfidence ?? "insufficient"}`}
                    aria-hidden
                    title={confidenceTooltip(d.fairValueConfidence, d.fairValueComps, t)}
                  />
                  {d.fairValueSource === "130point"
                    ? "ventes réelles"
                    : (d.fairValueComps ?? 0) < 5
                    ? "actif rare"
                    : "annonces actives"}
                </span>
                {d.fairValueRange?.p25Cad != null && d.fairValueRange?.p75Cad != null && (
                  <span className="dl-card__range">
                    {formatCad(d.fairValueRange.p25Cad)}–{formatCad(d.fairValueRange.p75Cad)}
                  </span>
                )}
              </p>
            ) : (
              <p className="dl-card__fair-value dl-card__fair-value--none cn-mono">
                <span className="dl-card__conf dl-card__conf--insufficient" aria-hidden />
                Cote indisponible · carte rare{(d.fairValueComps ?? 0) >= 1 ? ` (${d.fairValueComps} en vente)` : ""}
              </p>
            )}

            {d.url ? (
              <a
                className={`dl-cta ${isAcheter ? "dl-cta--buy" : "dl-cta--neutral"}`}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={() => trackEbayClick({ url: d.url, playerName: d.playerName, playerId: d.playerId, price: d.priceCad })}
              >
                <span className="dl-cta__label">
                  {isAcheter ? "Acheter sur eBay" : "Voir sur eBay"}
                </span>
                <span className="dl-cta__arrow" aria-hidden>→</span>
              </a>
            ) : null}

            <div className="dl-card__links">
              {d.url ? (
                <a
                  className="dl-link dl-link--analyse"
                  href={`/analyse?url=${encodeURIComponent(d.url)}`}
                >
                  Analyser
                  <span className="dl-link__arrow" aria-hidden>↗</span>
                </a>
              ) : null}
              {d.playerId && (
                <button
                  type="button"
                  className="dl-vault-btn"
                  onClick={() => setVaultOpen(true)}
                  aria-label="Ajouter au vault"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="2" y="7" width="20" height="14" rx="2"/>
                    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                    <line x1="12" y1="12" x2="12" y2="16"/>
                    <line x1="10" y1="14" x2="14" y2="14"/>
                  </svg>
                  + Vault
                </button>
              )}
              {d.playerId && (
                <button
                  type="button"
                  className="dl-vault-btn"
                  onClick={() => setAlertOpen(true)}
                  aria-label="Créer une alerte prix"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10 21a2 2 0 0 0 4 0" />
                  </svg>
                  Alerte
                </button>
              )}
            </div>
          </div>
        </article>
      </TiltCard>
      {vaultOpen && d.playerId && (
        <FastAddVaultModal
          player={{ id: String(d.playerId), name: d.playerName ?? "Joueur", headshotUrl: null }}
          initialPrice={d.price}
          onClose={() => setVaultOpen(false)}
        />
      )}
      {alertOpen && d.playerId && (
        <PriceAlertModal
          playerId={String(d.playerId)}
          playerName={d.playerName ?? "Joueur"}
          suggestedPrice={Math.round(Number(d.price) * 0.85)}
          onClose={() => setAlertOpen(false)}
        />
      )}
      {scoreOpen && (
        <ScoreDetailModal d={d} player={player} onClose={() => setScoreOpen(false)} />
      )}
    </Reveal>
  );
}

/* ─── Watchlist heart button ─────────────────────────────────────────────── */

function WatchlistHeart({ playerId, playerName, watchedIds, onToggle }) {
  if (!playerId) return null;
  const watched = watchedIds.has(String(playerId));
  return (
    <button
      type="button"
      className={`dl-heart${watched ? " dl-heart--active" : ""}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(playerId, playerName, watched); }}
      aria-label={watched ? `Retirer ${playerName} de la watchlist` : `Ajouter ${playerName} à la watchlist`}
      aria-pressed={watched}
    >
      <svg viewBox="0 0 24 24" fill={watched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>
      </svg>
    </button>
  );
}

// Skeleton qui reprend la structure exacte de DealCard (média + score +
// titre + prix) plutôt qu'un simple bloc gris générique (tâche 4.2 du plan).
const SEARCH_STEPS = [
  "Recherche des annonces eBay",
  "Filtrage des reprints, lots et packs",
  "Estimation de la juste valeur du marché",
  "Scoring IA de chaque carte",
  "Presque prêt…",
];

/**
 * Stepper de progression pendant l'analyse (~10-15s : eBay + DeepSeek). Rend le
 * temps d'attente vivant plutôt qu'un spinner muet. Timer d'état pur + barre CSS
 * (pas de framer — piège AnimatePresence connu pour du texte qui doit s'afficher).
 * @param {{ player?: string }} props
 */
function SearchProgress({ player }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    const id = setInterval(() => {
      setStep((s) => {
        if (s >= SEARCH_STEPS.length - 1) {
          clearInterval(id);
          return s;
        }
        return s + 1;
      });
    }, 3000);
    return () => clearInterval(id);
  }, [player]);

  const pct = Math.round(((step + 1) / SEARCH_STEPS.length) * 100);
  return (
    <div className="dl-progress" role="status" aria-live="polite">
      <p className="dl-progress__label cn-mono">
        <span className="dl-progress__spinner" aria-hidden />
        {SEARCH_STEPS[step]}
        {player ? <span className="dl-progress__player"> · {player}</span> : null}
      </p>
      <div className="dl-progress__bar" aria-hidden>
        <div className="dl-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DealSkeletonCard() {
  return (
    <div className="dl-skel-card" aria-hidden>
      <div className="dl-skel-card__media">
        <div className="dl-skel-card__score" />
      </div>
      <div className="dl-skel-card__body">
        <div className="dl-skel-line dl-skel-line--group" />
        <div className="dl-skel-line dl-skel-line--title" />
        <div className="dl-skel-line dl-skel-line--title-short" />
        <div className="dl-skel-line dl-skel-line--meta" />
        <div className="dl-skel-card__price-row">
          <div className="dl-skel-line dl-skel-line--price" />
        </div>
      </div>
    </div>
  );
}

function DealSkeletonGrid({ count = 9 }) {
  return (
    <div className="dl-grid" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <DealSkeletonCard key={`dl-sk-${i}`} />
      ))}
    </div>
  );
}

export default function DealFinderClient() {
  const { marketplace } = usePreferences();
  const t = useT();
  const [query, setQuery] = useState("");
  const [scoredAt, setScoredAt] = useState(null);
  const [nowTick, setNowTick] = useState(0);
  const [recentSearches, setRecentSearches] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [hottestExpanded, setHottestExpanded] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestItems, setSuggestItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingPlayer, setLoadingPlayer] = useState("");
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [cardMode, setCardMode] = useState("raw");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [signalFilter, setSignalFilter] = useState("all");
  const [copyDone, setCopyDone] = useState(false);

  const [hottestLoading, setHottestLoading] = useState(true);
  const [hottestError, setHottestError] = useState(null);
  /** @type {[Array<object> | null, (v: Array<object> | null) => void]} */
  const [hottestCards, setHottestCards] = useState(null);
  const [hottestMocked, setHottestMocked] = useState(false);
  const [hottestFetchedAt, setHottestFetchedAt] = useState(null);
  const [hottestCardMode, setHottestCardMode] = useState("raw");
  const [filters, setFilters] = useState(DEFAULT_HOTTEST_FILTERS);
  const [filtersSaving, setFiltersSaving] = useState(false);
  const [filtersSavedAt, setFiltersSavedAt] = useState(null);

  const [watchedIds, setWatchedIds] = useState(new Set());
  const [watchlistAuthed, setWatchlistAuthed] = useState(false);
  const [hottestRefreshKey, setHottestRefreshKey] = useState(0);

  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareQuery, setCompareQuery] = useState("");
  const [showCompareInput, setShowCompareInput] = useState(false);
  const [compareSuggestions, setCompareSuggestions] = useState([]);
  const [compareSugLoading, setCompareSugLoading] = useState(false);
  const compareDebounceRef = useRef(null);

  const searchParams = useSearchParams();
  const toast = useToast();

  const comboRef = useRef(null);
  const queryRef = useRef(query);
  const justSelectedRef = useRef(false);
  const cardModeRef = useRef(cardMode);
  const analyzedPlayerRef = useRef(null);
  const hasAnalysisRef = useRef(false);
  queryRef.current = query;

  // Fetch watchlist once on mount
  // Tick toutes les 30s pour rafraîchir l'horodatage "scoré il y a X min"
  useEffect(() => {
    if (!scoredAt) return;
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [scoredAt]);

  // Chargement initial de l'historique des recherches récentes
  useEffect(() => {
    setRecentSearches(readRecent());
  }, []);

  const pushRecentSearch = useCallback((name) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const lower = trimmed.toLowerCase();
      const next = [trimmed, ...prev.filter((n) => n.toLowerCase() !== lower)].slice(0, RECENT_MAX);
      writeRecent(next);
      return next;
    });
  }, []);

  const removeRecentSearch = useCallback((name) => {
    setRecentSearches((prev) => {
      const next = prev.filter((n) => n.toLowerCase() !== name.toLowerCase());
      writeRecent(next);
      return next;
    });
  }, []);

  useEffect(() => {
    fetch("/api/watchlist").then(async (r) => {
      if (r.status === 401) return;
      setWatchlistAuthed(true);
      const json = await r.json();
      const ids = new Set((json.items ?? []).map((it) => String(it.player_id)));
      setWatchedIds(ids);
    }).catch(() => {});
  }, []);

  // Filtres sauvegardés — restaurés une seule fois au montage, et seulement si
  // l'utilisateur en a déjà enregistré (401 = visiteur anonyme, on garde les
  // défauts sans rien signaler).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/preferences")
      .then(async (r) => {
        if (!r.ok) return;
        const json = await r.json();
        const saved = json?.preferences?.hottest_filters;
        if (cancelled || !saved) return;
        setFilters({ ...DEFAULT_HOTTEST_FILTERS, ...saved });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Toute modification invalide la confirmation « Sauvegardé » : elle ne doit
  // jamais laisser croire que l'état affiché est celui qui est persisté.
  useEffect(() => {
    setFiltersSavedAt(null);
  }, [filters]);

  async function saveFilters() {
    setFiltersSaving(true);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hottest_filters: filters }),
      });
      if (res.ok) setFiltersSavedAt(Date.now());
    } catch {
      /* silencieux : l'échec laisse simplement le bouton disponible */
    } finally {
      setFiltersSaving(false);
    }
  }

  async function toggleWatch(playerId, playerName, currentlyWatched) {
    if (!watchlistAuthed) { toast("Connecte-toi pour sauvegarder des joueurs", "info"); return; }
    const id = String(playerId);
    // Optimistic
    setWatchedIds((prev) => {
      const next = new Set(prev);
      currentlyWatched ? next.delete(id) : next.add(id);
      return next;
    });
    try {
      if (currentlyWatched) {
        const r = await fetch(`/api/watchlist?playerId=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (r.ok) toast(`${playerName} retiré de la watchlist`, "info");
        else throw new Error();
      } else {
        const r = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ playerId: id, playerName }),
        });
        if (r.ok) toast(`${playerName} ajouté à la watchlist`, "success");
        else throw new Error();
      }
    } catch {
      // Revert optimistic
      setWatchedIds((prev) => {
        const next = new Set(prev);
        currentlyWatched ? next.add(id) : next.delete(id);
        return next;
      });
      toast("Erreur — réessaie", "error");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const playerParam = params.get("player")?.trim();
    const signalParam = params.get("signal")?.trim();
    const compareParam = params.get("compare")?.trim();
    const startCompareParam = params.get("startCompare")?.trim();
    if (signalParam && ["acheter", "chercher", "passer"].includes(signalParam)) {
      setSignalFilter(signalParam);
    }
    if (playerParam) {
      setQuery(playerParam);
      runAnalyze(playerParam);
    }
    if (compareParam) {
      const [p1, p2] = compareParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (p1 && p2) loadCompare(p1, p2);
    }
    // Arrive depuis "Comparer à un autre joueur" (page /player/[id], tâche 5.2 —
    // /compare fusionné dans /deals) : joueur 1 déjà recherché via ?player=,
    // ouvre juste le champ de saisie du 2e joueur.
    if (startCompareParam === "1") {
      setShowCompareInput(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compare player 2 against already-loaded player 1 results
  const fetchCompareSuggestions = useCallback((q) => {
    if (compareDebounceRef.current) clearTimeout(compareDebounceRef.current);
    if (!q || q.trim().length < 2) { setCompareSuggestions([]); return; }
    compareDebounceRef.current = setTimeout(async () => {
      setCompareSugLoading(true);
      try {
        const r = await fetch(`/api/player?q=${encodeURIComponent(q.trim())}`);
        const json = await r.json();
        setCompareSuggestions(Array.isArray(json) ? json.slice(0, 6) : []);
      } catch { setCompareSuggestions([]); }
      finally { setCompareSugLoading(false); }
    }, 280);
  }, []);

  const startCompare = useCallback(async (p2name, p1Data) => {
    setCompareMode(true);
    setCompareLoading(true);
    setShowCompareInput(false);
    setCompareData({
      p1: { name: p1Data.playerName ?? query, listings: p1Data.listings ?? [] },
      p2: { name: p2name, listings: null, error: null },
    });
    try {
      const r = await fetch(`/api/deals?player=${encodeURIComponent(p2name)}&mode=raw&marketplace=${marketplace}`);
      const json = await r.json();
      if (!r.ok) {
        setCompareData((prev) => ({ ...prev, p2: { name: p2name, listings: [], error: json.error ?? "Erreur API" } }));
      } else {
        setCompareData((prev) => ({ ...prev, p2: { name: p2name, listings: Array.isArray(json.listings) ? json.listings : [], error: null } }));
      }
    } catch {
      setCompareData((prev) => ({ ...prev, p2: { name: p2name, listings: [], error: "Impossible de contacter le serveur" } }));
    } finally {
      setCompareLoading(false);
    }
  }, [query]);

  // Legacy URL-based compare (kept for backwards compat but less used)
  const loadCompare = useCallback(async (p1, p2) => {
    setCompareMode(true);
    setCompareLoading(true);
    setCompareData({ p1: { name: p1, listings: null, error: null }, p2: { name: p2, listings: null, error: null } });
    const fetchPlayer = async (name) => {
      try {
        const r = await fetch(`/api/deals?player=${encodeURIComponent(name)}&mode=raw&marketplace=${marketplace}`);
        const json = await r.json();
        if (!r.ok) return { name, listings: [], error: json.error ?? "Erreur API" };
        return { name, listings: Array.isArray(json.listings) ? json.listings : [], error: null };
      } catch {
        return { name, listings: [], error: "Impossible de contacter le serveur" };
      }
    };
    const r1 = await fetchPlayer(p1);
    setCompareData((prev) => ({ ...prev, p1: r1 }));
    const r2 = await fetchPlayer(p2);
    setCompareData((prev) => ({ ...prev, p2: r2 }));
    setCompareLoading(false);
  }, []);

  const availableListings = useMemo(() => {
    if (!data?.listings?.length) return [];
    return data.listings;
  }, [data]);

  const displayedListings = useMemo(() => {
    return availableListings.filter((d) => {
      if (!matchesBudget(d.price, budgetFilter)) return false;
      if (signalFilter !== "all") {
        const v = String(d.verdict ?? "").toLowerCase();
        if (signalFilter === "acheter" && !v.includes("acheter")) return false;
        if (signalFilter === "chercher" && !v.includes("chercher")) return false;
        if (signalFilter === "passer" && !v.includes("passer") && !v.includes("éviter") && !v.includes("eviter")) return false;
      }
      return true;
    });
  }, [availableListings, budgetFilter, signalFilter]);

  // "Deals prioritaires" (tâche 4.2) — verdict Acheter, pour le compteur d'en-tête.
  const priorityDealCount = useMemo(
    () => displayedListings.filter((d) => String(d.verdict ?? "").toLowerCase().includes("acheter")).length,
    [displayedListings]
  );

  const filteredHottestCards = useMemo(() => {
    if (!hottestCards) return [];
    return hottestCards.filter((card) => {
      const price = Number(card.price);
      if (!Number.isFinite(price)) return false;
      if (price < filters.minPrice) return false;
      // maxPrice au plafond = « et plus », donc aucune borne haute.
      if (filters.maxPrice < PRICE_MAX && price > filters.maxPrice) return false;
      if (!teamMatchesCard(card, filters.team)) return false;
      if (!playerStageMatchesCard(card, filters.playerStage)) return false;
      if (!cardTypeMatchesCard(card.groupType, filters.cardType)) return false;
      const cs = Number(card.cardScoutScore);
      if (Number.isFinite(cs) && cs < filters.minScore) return false;
      return true;
    });
  }, [hottestCards, filters]);

  async function refreshHottest() {
    setHottestRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelled = false;
    setHottestLoading(true);
    setHottestError(null);
    fetch(`/api/deals/hottest?mode=${encodeURIComponent(hottestCardMode)}`, {
      method: "GET",
    })
      .then((res) => res.json().then((json) => ({ res, json })))
      .then(({ res, json }) => {
        if (cancelled) return;
        if (!res.ok) {
          setHottestError(json?.error ?? "Chargement impossible");
          setHottestCards([]);
          return;
        }
        setHottestCards(Array.isArray(json.cards) ? json.cards : []);
        setHottestMocked(Boolean(json.mocked));
        setHottestFetchedAt(Number(json.fetchedAt) || Date.now());
      })
      .catch(() => {
        if (!cancelled) {
          setHottestError("Chargement impossible");
          setHottestCards([]);
        }
      })
      .finally(() => {
        if (!cancelled) setHottestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hottestCardMode, hottestRefreshKey]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!comboRef.current?.contains(e.target)) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    if (hasSearched) return;

    const q = query.trim();
    if (q.length < 2) {
      setSuggestItems([]);
      setSuggestOpen(false);
      setSuggestLoading(false);
      justSelectedRef.current = false;
      return;
    }

    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      setSuggestItems([]);
      setSuggestLoading(false);
      return;
    }

    setSuggestOpen(true);
    setSuggestItems([]);
    setSuggestLoading(true);

    let active = true;
    const t = setTimeout(async () => {
      if (!active) return;
      const captured = q;
      try {
        const res = await fetch(`/api/player?q=${encodeURIComponent(captured)}`, {
          method: "GET",
        });
        const json = await res.json();
        if (!active || queryRef.current.trim() !== captured) return;
        setSuggestItems(Array.isArray(json.results) ? json.results : []);
      } catch {
        if (active && queryRef.current.trim() === captured) {
          setSuggestItems([]);
        }
      } finally {
        if (active && queryRef.current.trim() === captured) {
          setSuggestLoading(false);
        }
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, hasSearched]);

  async function runAnalyze(nameOverride, modeOverride, refresh = false) {
    const name = (nameOverride ?? query).trim();
    if (!name) {
      setError("Entre un nom de joueur.");
      return;
    }
    const mode = modeOverride ?? cardModeRef.current;
    setHasSearched(true);
    setHottestExpanded(false);
    setSuggestOpen(false);
    setLoading(true);
    setLoadingPlayer(name);
    setError(null);
    setData(null);
    analyzedPlayerRef.current = name;
    hasAnalysisRef.current = true;
    try {
      const refreshParam = refresh ? "&refresh=1" : "";
      const res = await fetch(
        `/api/deals?player=${encodeURIComponent(name)}&mode=${encodeURIComponent(mode)}&marketplace=${marketplace}${refreshParam}`,
        { method: "GET" }
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Analyse impossible");
        setData(null);
        return;
      }
      setData(json);
      setScoredAt(Date.now());
      pushRecentSearch(name);
      // Mémoire visiteur — sauvegarde le joueur consulté
      const pid = json?.playerId ?? json?.player?.id ?? json?.player_id;
      if (pid) {
        pushRecentPlayer({
          id: pid,
          name,
          headshotUrl: json?.player?.headshot_url ?? json?.player?.headshotUrl ?? null,
          team: json?.player?.team ?? null,
        });
      }
    } catch {
      setError("Impossible de contacter le serveur");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    runAnalyze();
  }

  function pickPlayer(p) {
    const n = p?.name?.trim();
    if (!n) return;
    justSelectedRef.current = true;
    setSuggestOpen(false);
    setSuggestItems([]);
    setSuggestLoading(false);
    setQuery(n);
    runAnalyze(n);
  }

  function handleSearchFocus() {
    if (hasSearched) return;
    if (justSelectedRef.current) return;
    if (query.trim().length >= 2) setSuggestOpen(true);
  }

  function handleSearchKeyDown(e) {
    if (e.key === "Escape") {
      setSuggestOpen(false);
      justSelectedRef.current = false;
    }
  }

  function handleCardModeChange(mode) {
    if (mode === cardModeRef.current) return;
    cardModeRef.current = mode;
    if (hasAnalysisRef.current && analyzedPlayerRef.current) {
      runAnalyze(analyzedPlayerRef.current, mode);
    }
    setCardMode(mode);
  }

  function handleSignalFilter(signal) {
    setSignalFilter(signal);
    const params = new URLSearchParams(window.location.search);
    if (signal === "all") {
      params.delete("signal");
    } else {
      params.set("signal", signal);
    }
    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  function shareDeals() {
    const params = new URLSearchParams();
    if (analyzedPlayerRef.current) params.set("player", analyzedPlayerRef.current);
    if (signalFilter !== "all") params.set("signal", signalFilter);
    const url = `${window.location.origin}/deals?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  }

  function resetSearch() {
    setHasSearched(false);
    setHottestExpanded(false);
    setQuery("");
    setData(null);
    setError(null);
    setLoading(false);
    setLoadingPlayer("");
    setBudgetFilter("all");
    setSignalFilter("all");
    setSuggestOpen(false);
    setSuggestItems([]);
    analyzedPlayerRef.current = null;
    hasAnalysisRef.current = false;
  }

  const isDefaultFilters =
    filters.cardType === DEFAULT_HOTTEST_FILTERS.cardType &&
    filters.playerStage === DEFAULT_HOTTEST_FILTERS.playerStage &&
    filters.team === DEFAULT_HOTTEST_FILTERS.team &&
    filters.minPrice === DEFAULT_HOTTEST_FILTERS.minPrice &&
    filters.maxPrice === DEFAULT_HOTTEST_FILTERS.maxPrice &&
    filters.minScore === DEFAULT_HOTTEST_FILTERS.minScore;

  const priceLabel = `${filters.minPrice} $ – ${filters.maxPrice}${filters.maxPrice >= PRICE_MAX ? " $+" : " $"}`;

  const hottestFilters = (
    <section className="dl-filters" aria-label="Filtres Hottest Deals">
      <div className="dl-filters__bar">
        <span className="dl-filters__title">Filtres</span>
        <span className="dl-filters__count" aria-live="polite">
          <strong>{filteredHottestCards.length}</strong>
          {" "}
          {filteredHottestCards.length > 1 ? "cartes" : "carte"}
          {hottestCards ? ` sur ${hottestCards.length}` : ""}
        </span>

        <div className="dl-filters__actions">
          <button
            type="button"
            className="dl-filter__reset"
            disabled={isDefaultFilters}
            onClick={() => setFilters(DEFAULT_HOTTEST_FILTERS)}
          >
            Réinitialiser
          </button>

          {watchlistAuthed ? (
            filtersSavedAt ? (
              <span className="dl-filter__saved">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Sauvegardé
              </span>
            ) : (
              <button
                type="button"
                className="dl-filter__save"
                onClick={saveFilters}
                disabled={filtersSaving}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
                  <path d="M17 21v-8H7v8M7 3v5h8" />
                </svg>
                {filtersSaving ? "Sauvegarde…" : "Sauvegarder"}
              </button>
            )
          ) : (
            <span className="dl-filter__hint">
              <a href="/auth/login">Connecte-toi</a> pour sauvegarder tes filtres
            </span>
          )}
        </div>
      </div>

      <div className="dl-filters__body">
        <div className="dl-filter dl-filter--wide">
          <div className="dl-filter__head">
            <span className="cn-label">Type de carte</span>
          </div>
          <div className="dl-pills" role="group" aria-label="Type de carte">
            {HOTTEST_CARD_TYPE_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`dl-pill${filters.cardType === t.id ? " dl-pill--active" : ""}`}
                aria-pressed={filters.cardType === t.id}
                onClick={() => setFilters((prev) => ({ ...prev, cardType: t.id }))}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dl-filter dl-filter--wide">
          <div className="dl-filter__head">
            <span className="cn-label">Stade de carrière</span>
          </div>
          <div className="dl-pills" role="group" aria-label="Stade de carrière du joueur">
            {PLAYER_STAGE_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                className={`dl-pill${filters.playerStage === s.id ? " dl-pill--active" : ""}`}
                aria-pressed={filters.playerStage === s.id}
                onClick={() => setFilters((prev) => ({ ...prev, playerStage: s.id }))}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dl-filter">
          <div className="dl-filter__head">
            <label className="cn-label" htmlFor="dl-team">Équipe</label>
          </div>
          <select
            id="dl-team"
            className="dl-select cn-mono"
            value={filters.team}
            onChange={(e) => setFilters((prev) => ({ ...prev, team: e.target.value }))}
          >
            {NHL_TEAM_OPTIONS.map((team) => (
              <option key={team.id} value={team.id}>
                {team.label}
              </option>
            ))}
          </select>
        </div>

        <div className="dl-filter">
          <div className="dl-filter__head">
            <span className="cn-label">Score minimum</span>
            <span className="dl-filter__value">{filters.minScore.toFixed(1)}+</span>
          </div>
          <div className="dl-range">
            <div className="dl-range__track" />
            <div
              className="dl-range__fill"
              style={{ left: 0, width: `${(filters.minScore / 10) * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={filters.minScore}
              aria-label="Score minimum"
              aria-valuetext={`${filters.minScore} sur 10`}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, minScore: Number(e.target.value) }))
              }
            />
          </div>
          <div className="dl-range__ticks">
            <span>0</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>

        <div className="dl-filter dl-filter--wide">
          <div className="dl-filter__head">
            <span className="cn-label">Prix</span>
            <span className="dl-filter__value">{priceLabel}</span>
          </div>
          <div className="dl-range">
            <div className="dl-range__track" />
            <div
              className="dl-range__fill"
              style={{
                left: `${(filters.minPrice / PRICE_MAX) * 100}%`,
                width: `${((filters.maxPrice - filters.minPrice) / PRICE_MAX) * 100}%`,
              }}
            />
            <input
              type="range"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={10}
              value={filters.minPrice}
              aria-label="Prix minimum"
              aria-valuetext={`${filters.minPrice} dollars`}
              onChange={(e) => {
                const v = Number(e.target.value);
                // Les curseurs ne se croisent jamais : le min pousse le max.
                setFilters((prev) => ({
                  ...prev,
                  minPrice: Math.min(v, prev.maxPrice),
                }));
              }}
            />
            <input
              type="range"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={10}
              value={filters.maxPrice}
              aria-label="Prix maximum"
              aria-valuetext={`${filters.maxPrice} dollars${filters.maxPrice >= PRICE_MAX ? " et plus" : ""}`}
              onChange={(e) => {
                const v = Number(e.target.value);
                setFilters((prev) => ({
                  ...prev,
                  maxPrice: Math.max(v, prev.minPrice),
                }));
              }}
            />
          </div>
          <div className="dl-range__ticks">
            <span>0 $</span>
            <span>500 $</span>
            <span>1000 $+</span>
          </div>
        </div>
      </div>
    </section>
  );

  const hottestGrid = hottestLoading ? (
    <DealSkeletonGrid count={9} />
  ) : hottestError ? (
    <p className="dl-empty">{hottestError}</p>
  ) : hottestCards?.length ? (
    filteredHottestCards.length ? (
      <div className="dl-grid">
        {filteredHottestCards.map((d, i) => {
          const alts = String(d.verdict ?? "").toLowerCase().includes("chercher")
            ? filteredHottestCards
                .filter((x) => x.itemId !== d.itemId && x.cardGroup === d.cardGroup && Number(x.price) < Number(d.price))
                .sort((a, b) => Number(a.price) - Number(b.price))
                .slice(0, 3)
            : [];
          return (
            <DealCard
              key={`hot-${i}-${d.playerId ?? "p"}-${d.listingIndex}`}
              d={d}
              showPlayerChip
              index={i}
              watchedIds={watchedIds}
              onToggleWatch={toggleWatch}
              alternatives={alts}
            />
          );
        })}
      </div>
    ) : (
      <p className="dl-empty">Aucune carte ne correspond aux filtres.</p>
    )
  ) : (
    <p className="dl-empty">Aucune opportunité eBay pour l&apos;instant.</p>
  );

  return (
    <div className="dl-page cinematic">
      <ScrollProgress />
      <Atmosphere />

      <div className="dl-rail">
        <div className="dl-rail__inner">
          <AppNav active="deals" />
        </div>
      </div>

      <main className="dl-main">
        {/* ── HERO ── */}
        <Reveal as="header" className="dl-hero">
          <p className="cn-eyebrow dl-hero__eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            INTELLIGENCE · EBAY · TEMPS RÉEL
          </p>
          <h1 className="cn-h1 dl-hero__title">
            DEAL <span className="cn-h1__ice">FINDER</span>
          </h1>

          <form onSubmit={handleSubmit} className="dl-search">
            <div className="dl-search__field" ref={comboRef}>
              <svg
                className="dl-search__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                className="dl-search__input"
                type="search"
                autoComplete="off"
                placeholder="Rechercher un joueur — ex. Cole Caufield"
                value={query}
                onChange={(e) => {
                  if (hasSearched) return;
                  justSelectedRef.current = false;
                  setQuery(e.target.value);
                }}
                onClick={() => {
                  if (hasSearched && query.trim()) resetSearch();
                }}
                onFocus={handleSearchFocus}
                onKeyDown={handleSearchKeyDown}
                readOnly={hasSearched && Boolean(query.trim())}
                role="combobox"
                aria-label="Nom du joueur"
                aria-autocomplete="list"
                aria-controls="dl-suggest-list"
                aria-expanded={suggestOpen}
                title={
                  hasSearched && query.trim()
                    ? "Cliquer pour une nouvelle recherche"
                    : undefined
                }
              />
              <button
                className="dl-search__btn"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="cn-btn__spin" aria-hidden />
                    ANALYSE
                  </>
                ) : (
                  <>ANALYSER →</>
                )}
              </button>

              {!hasSearched &&
              suggestOpen &&
              (suggestLoading || suggestItems.length > 0) ? (
                <div className="dl-suggest" id="dl-suggest-list" role="listbox">
                  {suggestLoading ? (
                    <div className="dl-suggest__status">Recherche…</div>
                  ) : (
                    suggestItems.map((p) => (
                      <button
                        key={p.playerId ?? p.name}
                        type="button"
                        className="dl-suggest__item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickPlayer(p)}
                      >
                        <span>{p.name}</span>
                        {p.team ? (
                          <span className="dl-suggest__team cn-mono">{p.team}</span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="dl-modes" role="radiogroup" aria-label="Type de cartes">
              <button
                type="button"
                role="radio"
                aria-checked={cardMode === "raw"}
                className={`dl-mode${cardMode === "raw" ? " dl-mode--active" : ""}`}
                onClick={() => handleCardModeChange("raw")}
              >
                Raw
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={cardMode === "graded"}
                className={`dl-mode${cardMode === "graded" ? " dl-mode--active" : ""}`}
                onClick={() => handleCardModeChange("graded")}
              >
                Gradée
              </button>
            </div>

            {hasSearched ? (
              <button
                type="button"
                className="dl-reset"
                onClick={resetSearch}
              >
                Nouvelle recherche
              </button>
            ) : null}
          </form>

          {!hasSearched && !query.trim() ? (() => {
            const recentSet = new Set(recentSearches.map((n) => n.toLowerCase()));
            const suggestedExtras = SUGGESTED_PLAYERS.filter(
              (n) => !recentSet.has(n.toLowerCase())
            );
            const combined = [
              ...recentSearches.map((name) => ({ name, removable: true })),
              ...suggestedExtras.map((name) => ({ name, removable: false })),
            ];
            return (
              <div className="dl-quickstart" role="group" aria-label={t("deals.quickstart.label")}>
                <span className="dl-quickstart__label">{t("deals.quickstart.label")}</span>
                <div className="dl-quickstart__tags">
                  {combined.map(({ name, removable }) => (
                    <span key={name} className={`dl-quickstart__tag${removable ? " dl-quickstart__tag--recent" : ""}`}>
                      {removable && (
                        <button
                          type="button"
                          className="dl-quickstart__tag-x"
                          onClick={() => removeRecentSearch(name)}
                          aria-label={`${t("deals.recent.remove")} ${name}`}
                          title={t("deals.recent.remove")}
                        >
                          ×
                        </button>
                      )}
                      <button
                        type="button"
                        className="dl-quickstart__tag-name"
                        onClick={() => pickPlayer({ name })}
                      >
                        {name}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            );
          })() : null}

          {error ? (
            <div className="dl-error" role="alert">
              <span aria-hidden>⨯</span>
              <span>{error}</span>
            </div>
          ) : null}
        </Reveal>

        {/* ── SEARCH RESULTS ── */}
        {hasSearched ? (
          <section className="dl-section" aria-labelledby="dl-results-heading">
            <div className="dl-section__head">
              <h2 id="dl-results-heading" className="cn-h2">
                {query.trim() ? query.trim() : "Résultats"}
              </h2>
              {availableListings.length > 0 ? (
                <div className="dl-section__controls">
                  <div className="dl-signal-bar" role="group" aria-label="Signal">
                    {[
                      { id: "all", label: "Tous" },
                      { id: "acheter", label: "Acheter", cls: "dl-signal--buy" },
                      { id: "chercher", label: "Chercher mieux", cls: "dl-signal--hold" },
                      { id: "passer", label: "Passer", cls: "dl-signal--sell" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`dl-signal-btn${s.cls ? ` ${s.cls}` : ""}${signalFilter === s.id ? " dl-signal-btn--active" : ""}`}
                        aria-pressed={signalFilter === s.id}
                        onClick={() => handleSignalFilter(s.id)}
                      >
                        {s.id !== "all" && <span className="dl-signal-dot" aria-hidden />}
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="dl-pills" role="group" aria-label="Budget">
                    {BUDGET_FILTERS.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        className={`dl-pill dl-pill--mono${budgetFilter === b.id ? " dl-pill--active" : ""}`}
                        aria-pressed={budgetFilter === b.id}
                        onClick={() => setBudgetFilter(b.id)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="dl-share-btn"
                    onClick={shareDeals}
                    aria-label="Copier le lien partageable"
                  >
                    {copyDone ? (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                        Copié !
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                        Partager
                      </>
                    )}
                  </button>

                  {!compareMode && (
                    showCompareInput ? (
                      <div className="dl-compare-inline" style={{ position: "relative" }}>
                        <input
                          type="text"
                          className="dl-compare-inline__input"
                          placeholder="2e joueur…"
                          value={compareQuery}
                          onChange={(e) => { setCompareQuery(e.target.value); fetchCompareSuggestions(e.target.value); }}
                          autoFocus
                          autoComplete="off"
                          onKeyDown={(e) => { if (e.key === "Escape") { setShowCompareInput(false); setCompareSuggestions([]); } }}
                        />
                        <button type="button" className="dl-compare-inline__cancel" onClick={() => { setShowCompareInput(false); setCompareSuggestions([]); }}>×</button>
                        {compareSuggestions.length > 0 && (
                          <ul className="dl-compare-suggestions">
                            {compareSuggestions.map((p) => (
                              <li key={p.playerId ?? p.name}>
                                <button
                                  type="button"
                                  className="dl-compare-sug-item"
                                  onClick={() => {
                                    setCompareQuery(p.name);
                                    setCompareSuggestions([]);
                                    startCompare(p.name, data ?? {});
                                  }}
                                >
                                  {p.headshot && <img src={p.headshot} alt="" width={24} height={24} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />}
                                  <span>{p.name}</span>
                                  {p.teamAbbrev && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.75rem", marginLeft: "auto" }}>{p.teamAbbrev}</span>}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {compareSugLoading && compareQuery.length >= 2 && compareSuggestions.length === 0 && (
                          <div className="dl-compare-suggestions" style={{ padding: "0.6rem 0.8rem", color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}>Recherche…</div>
                        )}
                      </div>
                    ) : (
                      <button type="button" className="dl-compare-trigger" onClick={() => setShowCompareInput(true)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 3H5a2 2 0 0 0-2 2v4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/><path d="M15 21h4a2 2 0 0 0 2-2v-4"/></svg>
                        Comparer
                      </button>
                    )
                  )}
                </div>
              ) : null}
            </div>

            {loading ? (
              <>
                <SearchProgress player={loadingPlayer || query.trim()} />
                <DealSkeletonGrid count={6} />
              </>
            ) : data ? (
              displayedListings.length > 0 ? (
                <>
                  {scoredAt ? (
                    <div className="dl-freshness cn-mono">
                      <span className="dl-freshness__time">{formatScoredAgo(scoredAt, nowTick, t)}</span>
                      <button
                        type="button"
                        className="dl-freshness__btn"
                        onClick={() => runAnalyze(analyzedPlayerRef.current, cardModeRef.current, true)}
                        disabled={loading}
                        aria-label={t("deals.refresh")}
                        title={t("deals.refresh")}
                      >
                        <span aria-hidden>⟳</span> {t("deals.refresh")}
                      </button>
                    </div>
                  ) : null}
                  <p className="dl-strip cn-mono">
                    <CountUp value={displayedListings.length} duration={600} /> ANNONCE
                    {displayedListings.length > 1 ? "S" : ""}
                    {priorityDealCount > 0 && (
                      <span className="dl-strip__priority">
                        {" · "}
                        <CountUp value={priorityDealCount} duration={600} /> deal{priorityDealCount > 1 ? "s" : ""} prioritaire{priorityDealCount > 1 ? "s" : ""}
                      </span>
                    )}
                    {signalFilter !== "all" ? ` · ${signalFilter.toUpperCase()}` : ""}
                    {budgetFilter !== "all" ? " · BUDGET FILTRÉ" : ""}
                    {data.mocked ? " · DÉMO" : ""}
                    {data.claudeUsed ? " · IA" : ""}
                    {" · "}
                    <span className="dl-strip__source" title="Les cotes affichées sont basées sur les annonces eBay actives (prix demandés), pas sur les ventes réelles.">PRIX DEMANDÉS</span>
                  </p>
                  <div className="dl-grid">
                    {displayedListings.map((d, i) => {
                      const alts = String(d.verdict ?? "").toLowerCase().includes("chercher")
                        ? displayedListings
                            .filter((x) => x.itemId !== d.itemId && x.cardGroup === d.cardGroup && Number(x.price) < Number(d.price))
                            .sort((a, b) => Number(a.price) - Number(b.price))
                            .slice(0, 3)
                        : [];
                      return (
                        <DealCard
                          key={`${d.listingIndex}-${d.title}-${d.price}`}
                          d={d}
                          player={data?.player ?? null}
                          index={i}
                          watchedIds={watchedIds}
                          onToggleWatch={toggleWatch}
                          alternatives={alts}
                        />
                      );
                    })}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.3-4.3" />
                    </svg>
                  }
                  title={availableListings.length > 0 ? "Aucune annonce dans ce budget" : "Aucune annonce exploitable trouvée"}
                  description={
                    availableListings.length > 0
                      ? "Élargis le budget ou change de filtre ci-dessus pour voir plus d'annonces pour ce joueur."
                      : "Ce joueur n'a pas d'annonces eBay exploitables en ce moment — essaie un autre joueur ou reviens plus tard."
                  }
                  action={
                    availableListings.length > 0 ? (
                      <button type="button" onClick={() => { setBudgetFilter("all"); setSignalFilter("all"); }}>
                        Réinitialiser les filtres
                      </button>
                    ) : (
                      <button type="button" onClick={resetSearch}>
                        Chercher un autre joueur
                      </button>
                    )
                  }
                />
              )
            ) : null}
          </section>
        ) : null}

        {/* ── COMPARE MODE ── */}
        {compareMode && (
          <section className="dl-compare">
            <div className="dl-compare__header">
              <div>
                <h2 className="dl-compare__title">MODE COMPARAISON</h2>
                {compareLoading && (
                  <p className="dl-compare__hint">Analyse eBay en cours… peut prendre 30 secondes</p>
                )}
              </div>
              <button type="button" className="dl-compare__close" onClick={() => { setCompareMode(false); setCompareData(null); window.history.replaceState({}, "", "/deals"); }}>
                × Fermer
              </button>
            </div>
            {compareData && (
              <div className="dl-compare__cols">
                {[compareData.p1, compareData.p2].map((pd, idx) => {
                  const isLoading = pd.listings === null;
                  const isEmpty = !isLoading && pd.listings?.length === 0;
                  return (
                    <div key={idx} className="dl-compare__col">
                      <h3 className="dl-compare__col-title">{pd.name}</h3>
                      {isLoading ? (
                        <div className="dl-grid dl-compare__grid">
                          {[...Array(3)].map((_, i) => <div key={i} className="dl-skel" />)}
                        </div>
                      ) : pd.error ? (
                        <div className="dl-compare__empty">
                          <p>{pd.error}</p>
                          <button type="button" className="dl-compare__retry" onClick={() => loadCompare(compareData.p1.name, compareData.p2.name)}>
                            Réessayer
                          </button>
                        </div>
                      ) : isEmpty ? (
                        <div className="dl-compare__empty">
                          <p>Aucun deal trouvé sur eBay</p>
                          <button type="button" className="dl-compare__retry" onClick={() => loadCompare(compareData.p1.name, compareData.p2.name)}>
                            Réessayer
                          </button>
                        </div>
                      ) : (
                        <div className="dl-grid dl-compare__grid">
                          {pd.listings.slice(0, 6).map((d, i) => (
                            <DealCard key={d.itemId ?? i} d={{ ...d, playerName: pd.name }} showPlayerChip={false} index={i} watchedIds={watchedIds} onToggleWatch={toggleWatch} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── HOTTEST DEALS ── */}
        {!hasSearched ? (
          <section className="dl-section" aria-labelledby="dl-hot-heading">
            <div className="dl-section__head">
              <div>
                <p className="cn-eyebrow">
                  <span className="cn-eyebrow__dot" aria-hidden />
                  STARS NHL · {hottestCardMode === "graded" ? "GRADÉES" : "RAW"}
                  {hottestMocked ? " · DÉMO" : ""}
                </p>
                <h2 id="dl-hot-heading" className="cn-h2">
                  HOTTEST <span className="cn-h1__ice">DEALS</span>
                </h2>
              </div>
              <div
                className="dl-modes"
                role="radiogroup"
                aria-label="Type de cartes — Hottest Deals"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={hottestCardMode === "raw"}
                  className={`dl-mode${hottestCardMode === "raw" ? " dl-mode--active" : ""}`}
                  onClick={() => setHottestCardMode("raw")}
                  disabled={hottestLoading}
                >
                  Raw
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={hottestCardMode === "graded"}
                  className={`dl-mode${hottestCardMode === "graded" ? " dl-mode--active" : ""}`}
                  onClick={() => setHottestCardMode("graded")}
                  disabled={hottestLoading}
                >
                  Gradée
                </button>
              </div>
            </div>

            <RefreshBar onRefresh={refreshHottest} label="Hottest Deals" lastUpdatedAt={hottestFetchedAt} />
            {hottestFilters}
            {hottestGrid}
          </section>
        ) : (
          <section className="dl-section" aria-labelledby="dl-hot-compact-heading">
            <button
              type="button"
              id="dl-hot-compact-heading"
              className="dl-collapse"
              aria-expanded={hottestExpanded}
              onClick={() => setHottestExpanded((v) => !v)}
            >
              <span className="dl-collapse__label">
                <span className="cn-eyebrow__dot" aria-hidden />
                HOTTEST DEALS
              </span>
              <span
                className={`dl-collapse__chevron${hottestExpanded ? " dl-collapse__chevron--open" : ""}`}
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="16"
                  height="16"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>
            {hottestExpanded ? (
              <div className="dl-collapse__body">
                {hottestFilters}
                {hottestGrid}
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
