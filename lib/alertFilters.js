/**
 * Filtres des alertes prix (table price_alerts) — module PUR, sans import :
 * partagé par l'UI de création (client), la validation de /api/alerts et le
 * cron price-alerts. Testé par `npm run test:alerts`.
 *
 * Avant ces filtres, une alerte « Wyatt Johnston sous 28 $ » envoyait la
 * carte la moins chère du joueur, quelle qu'elle soit (retour de Carlo
 * 2026-09-30 : « trop de bruit »).
 */

/** Types de carte proposés à l'utilisateur (ids stables, stockés en base). */
export const ALERT_CARD_TYPES = [
  { id: "young_guns", label: "Young Guns" },
  { id: "auto", label: "Autographes" },
  { id: "numbered", label: "Numérotées" },
  { id: "patch", label: "Patch / Jersey" },
  { id: "premium", label: "Haut de gamme" },
  { id: "parallel", label: "Parallèles" },
  { id: "base", label: "Autres cartes" },
];

export const ALERT_CONDITIONS = [
  { id: "any", label: "Toutes" },
  { id: "raw", label: "Non gradées" },
  { id: "graded", label: "Gradées" },
];

/** Paliers de score d'annonce proposés (null = pas de minimum). */
export const ALERT_MIN_SCORES = [null, 5, 6, 7, 8];

export const ALERT_KEYWORD_MAX = 60;

const CARD_TYPE_IDS = new Set(ALERT_CARD_TYPES.map((t) => t.id));

/**
 * Traduit un groupe du Deal Finder (`detectCardGroup` dans lib/dealFinder.js)
 * en type d'alerte. Les gradées se filtrent par l'état (raw/gradée), pas par
 * le type : l'appelant détecte le groupe sur le titre SANS les mentions
 * PSA/BGS/SGC (sinon une Young Guns PSA 10 tomberait dans « Gradée » et
 * perdrait son type). Un groupe « Gradée » restant compte comme « base ».
 * @param {string | null | undefined} group
 * @returns {string}
 */
export function cardTypeFromGroup(group) {
  const g = String(group ?? "");
  if (g.includes("Young Guns")) return "young_guns";
  if (g.includes("Auto")) return "auto";
  if (g.includes("Numéroté")) return "numbered";
  if (g.includes("Jersey") || g.includes("Patch")) return "patch";
  if (
    g.includes("The Cup") ||
    g.includes("SPx") ||
    g.includes("OPC Plat") ||
    g.includes("Canvas") ||
    g.includes("Clear Cut")
  ) {
    return "premium";
  }
  if (g.includes("Parallèle")) return "parallel";
  return "base";
}

/**
 * Nettoie les filtres reçus du client. Toute valeur inconnue est ignorée
 * (jamais d'erreur bloquante pour un filtre optionnel mal formé).
 * @param {unknown} body
 * @returns {{ card_types: string[] | null; condition: "any" | "raw" | "graded"; min_score: number | null; keyword: string | null }}
 */
export function normalizeAlertFilters(body) {
  const b = body && typeof body === "object" ? /** @type {Record<string, unknown>} */ (body) : {};
  const types = Array.isArray(b.cardTypes)
    ? [...new Set(b.cardTypes.map(String).filter((t) => CARD_TYPE_IDS.has(t)))]
    : [];
  const condition = b.condition === "raw" || b.condition === "graded" ? b.condition : "any";
  const score = Number(b.minScore);
  const minScore = b.minScore != null && b.minScore !== "" && Number.isFinite(score) && score > 0 && score <= 10
    ? Math.round(score * 10) / 10
    : null;
  const keyword = typeof b.keyword === "string"
    ? b.keyword.trim().replace(/\s+/g, " ").slice(0, ALERT_KEYWORD_MAX)
    : "";
  return {
    // Tous les types cochés = aucun filtre (null) : même comportement, stockage simple.
    card_types: types.length > 0 && types.length < ALERT_CARD_TYPES.length ? types : null,
    condition,
    min_score: minScore,
    keyword: keyword || null,
  };
}

/**
 * Une annonce passe-t-elle les filtres d'une alerte ? (Le prix max, le joueur
 * et les exclusions lots/reprints sont vérifiés par l'appelant.)
 * @param {{ title: string; cardType: string; isGraded: boolean; score?: number | null }} listing
 * @param {{ card_types?: string[] | null; condition?: string | null; min_score?: number | null; keyword?: string | null }} alert
 */
export function listingMatchesAlertFilters(listing, alert) {
  const types = Array.isArray(alert.card_types) ? alert.card_types : null;
  if (types && types.length > 0 && !types.includes(listing.cardType)) return false;

  if (alert.condition === "raw" && listing.isGraded) return false;
  if (alert.condition === "graded" && !listing.isGraded) return false;

  const min = alert.min_score == null ? null : Number(alert.min_score);
  if (min != null && Number.isFinite(min)) {
    const s = listing.score == null ? NaN : Number(listing.score);
    if (!Number.isFinite(s) || s < min) return false;
  }

  const kw = typeof alert.keyword === "string" ? alert.keyword.trim() : "";
  if (kw) {
    const norm = (s) =>
      String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const title = norm(listing.title);
    // Chaque mot doit apparaître (ordre libre) : « series 1 201 » ⊂ titre.
    if (!norm(kw).split(" ").filter(Boolean).every((w) => title.includes(w))) return false;
  }
  return true;
}

/**
 * Résumé lisible des filtres, pour /alertes et les courriels.
 * @param {{ card_types?: string[] | null; condition?: string | null; min_score?: number | null; keyword?: string | null }} alert
 * @returns {string[]}
 */
export function describeAlertFilters(alert) {
  const out = [];
  const types = Array.isArray(alert.card_types) ? alert.card_types : [];
  if (types.length > 0) {
    out.push(
      types
        .map((id) => ALERT_CARD_TYPES.find((t) => t.id === id)?.label)
        .filter(Boolean)
        .join(", ")
    );
  }
  if (alert.condition === "raw") out.push("Non gradées");
  if (alert.condition === "graded") out.push("Gradées");
  if (alert.min_score != null) out.push(`Score ≥ ${Number(alert.min_score)}`);
  if (alert.keyword) out.push(`« ${alert.keyword} »`);
  return out;
}
