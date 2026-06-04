import "server-only";

/**
 * Scraping de la page publique SportsCardsPro (alimentée par PriceCharting) pour
 * obtenir des prix de VENTES réelles par grade — sans payer l'API.
 * Prix affichés en USD → convertis en CAD (×1.37, comme le reste de l'app).
 */

const SCP_SEARCH = "https://www.sportscardspro.com/search-products";
const USD_TO_CAD = 1.37;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const SCP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** @type {Map<string, { at: number; data: object | null }>} */
const scpCache = new Map();

function parsePriceUsd(raw) {
  const n = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Choisit l'en-tête de colonne selon le grade de la carte. */
function gradeColumnLabel(grade) {
  const g = String(grade ?? "").toUpperCase();
  if (!g) return "Ungraded";
  if (/10/.test(g)) return "PSA 10";
  if (/9\.5/.test(g)) return "Grade 9.5";
  if (/\b9\b/.test(g)) return "Grade 9";
  if (/\b8\b/.test(g)) return "Grade 8";
  if (/\b7\b/.test(g)) return "Grade 7";
  return "Ungraded";
}

/**
 * @param {string} query — ex. "Macklin Celebrini Young Guns 2024-25 Upper Deck 451"
 * @param {{ lastName?: string; cardNumber?: string | null; grade?: string | null }} [opts]
 * @returns {Promise<{ value: number | null; ungradedCad: number | null; byGrade: Record<string, number>; productTitle: string; sourceUrl: string } | null>}
 */
export async function fetchSportsCardsProValue(query, opts = {}) {
  const q = String(query ?? "").trim();
  if (!q) return null;

  const key = q.toLowerCase();
  const hit = scpCache.get(key);
  if (hit && Date.now() - hit.at < SCP_TTL_MS) return hit.data;

  const url = `${SCP_SEARCH}?type=prices&q=${encodeURIComponent(q)}&go=Go`;
  let html;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) {
      scpCache.set(key, { at: Date.now(), data: null });
      return null;
    }
    html = await res.text();
  } catch {
    return null;
  }

  const flat = html.replace(/\s+/g, " ");

  // Valide qu'on est sur le bon produit (titre contient le nom du joueur).
  const titleMatch =
    flat.match(/<h1[^>]*id="product_name"[^>]*>(.*?)<\/h1>/i) ||
    flat.match(/<title>(.*?)<\/title>/i);
  const productTitle = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : "";
  const titleLower = productTitle.toLowerCase();
  const lastName = String(opts.lastName ?? "").toLowerCase();
  if (lastName && !titleLower.includes(lastName)) {
    scpCache.set(key, { at: Date.now(), data: null });
    return null; // mauvais produit → on s'abstient
  }

  // Table de prix.
  const ti = flat.indexOf('id="price_data"');
  if (ti < 0) {
    scpCache.set(key, { at: Date.now(), data: null });
    return null;
  }
  const seg = flat.slice(ti, ti + 5000);

  // En-têtes de colonnes (Ungraded, Grade 7/8/9/9.5, PSA 10).
  const heads = [...seg.matchAll(/<th[^>]*>(.*?)<\/th>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);

  // Première ligne de prix : on lit CHAQUE cellule (même vide) pour garder
  // l'alignement positionnel avec les colonnes.
  const rowMatch = seg.match(/<tbody>\s*<tr>(.*?)<\/tr>/);
  const rowHtml = rowMatch ? rowMatch[1] : seg;
  const tds = [...rowHtml.matchAll(/<td[^>]*id="\w+_price"[^>]*>(.*?)<\/td>/g)].map(
    (m) => {
      const pm = m[1].match(/js-price[^>]*>\s*\$?\s*([\d,]+\.?\d*)/);
      return pm ? parsePriceUsd(pm[1]) : null;
    }
  );

  /** @type {Record<string, number>} */
  const byGrade = {};
  for (let i = 0; i < heads.length && i < tds.length; i++) {
    if (tds[i] != null) {
      byGrade[heads[i]] = Math.round(tds[i] * USD_TO_CAD * 100) / 100;
    }
  }

  const ungradedCad = byGrade.Ungraded ?? null;
  const value = byGrade[gradeColumnLabel(opts.grade)] ?? ungradedCad;

  const data =
    value != null || ungradedCad != null
      ? { value, ungradedCad, byGrade, productTitle, sourceUrl: url }
      : null;
  scpCache.set(key, { at: Date.now(), data });
  return data;
}
