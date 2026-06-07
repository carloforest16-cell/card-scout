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

/** Slug SCP : minuscules, accents retirés, non-alphanum → tirets. */
export function scpNameSlug(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritiques (Slafkovský → slafkovsky)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Suffixes de set = parallèles/variants à EXCLURE (on veut la base Young Guns). */
const YG_BASE_SET_RE = /^hockey-cards-(\d{4})-upper-deck-young-guns$/;

/**
 * Résout l'URL canonique de la carte Young Guns BASE d'un joueur via SCP.
 * On parse TOUS les liens /game/ de la page (résultats OU page produit, qui
 * liste les autres versions), on garde ceux dont le set est EXACTEMENT
 * `hockey-cards-{année}-upper-deck-young-guns` (pas -jumbo/-retro/-canvas…) et
 * dont le slug carte commence par le nom du joueur, puis on prend l'année la
 * plus ancienne (= saison recrue). Retourne null si rien de fiable.
 * @param {string} playerName
 * @returns {Promise<{ url: string; year: string; number: string; label: string } | null>}
 */
export async function resolveYoungGunsProductUrl(playerName) {
  const slug = scpNameSlug(playerName);
  if (!slug) return null;

  const searchUrl = `${SCP_SEARCH}?type=prices&q=${encodeURIComponent(
    `${playerName} young guns`
  )}&go=Go`;

  let html;
  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // Tous les liens produit /game/{set}/{carte}
  const links = [
    ...html.matchAll(/\/game\/(hockey-cards-[a-z0-9-]+)\/([a-z0-9-]+-\d+)/g),
  ];

  /** @type {Array<{ url: string; year: string; number: string }>} */
  const candidates = [];
  const seen = new Set();
  for (const m of links) {
    const setSlug = m[1];
    const cardSlug = m[2];
    const baseMatch = setSlug.match(YG_BASE_SET_RE);
    if (!baseMatch) continue; // exclut jumbo/retro/canvas/exclusive/renewed…
    if (!cardSlug.startsWith(`${slug}-`)) continue; // bon joueur
    const numMatch = cardSlug.match(/-(\d+)$/);
    if (!numMatch) continue;
    const url = `https://www.sportscardspro.com/game/${setSlug}/${cardSlug}`;
    if (seen.has(url)) continue;
    seen.add(url);
    candidates.push({ url, year: baseMatch[1], number: numMatch[1] });
  }

  if (candidates.length === 0) return null;

  // Saison recrue = année la plus ancienne.
  candidates.sort((a, b) => Number(a.year) - Number(b.year));
  const best = candidates[0];
  const seasonLabel = `${best.year}-${String(Number(best.year) + 1).slice(2)}`;
  return {
    url: best.url,
    year: best.year,
    number: best.number,
    label: `${seasonLabel} UD Young Guns #${best.number}`,
  };
}

/**
 * Récupère la valeur ungraded (CAD) directement depuis une URL produit SCP
 * déjà résolue — déterministe, 1 requête, pas de recherche.
 * @param {string} productUrl
 * @returns {Promise<number | null>} valeur ungraded en CAD, ou null
 */
export async function fetchUngradedCadFromUrl(productUrl) {
  const url = String(productUrl ?? "").trim();
  if (!/^https:\/\/www\.sportscardspro\.com\/game\//.test(url)) return null;

  let html;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  const flat = html.replace(/\s+/g, " ");
  const ti = flat.indexOf('id="price_data"');
  if (ti < 0) return null;
  const seg = flat.slice(ti, ti + 5000);

  // La 1re colonne de la 1re ligne de prix = Ungraded.
  const rowMatch = seg.match(/<tbody>\s*<tr>(.*?)<\/tr>/);
  const rowHtml = rowMatch ? rowMatch[1] : seg;
  const firstCell = rowHtml.match(
    /<td[^>]*id="\w+_price"[^>]*>.*?js-price[^>]*>\s*\$?\s*([\d,]+\.?\d*)/
  );
  const usd = firstCell ? parsePriceUsd(firstCell[1]) : null;
  if (usd == null) return null;
  return Math.round(usd * USD_TO_CAD * 100) / 100;
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
