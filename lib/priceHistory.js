import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { computeFairValueByFingerprint, realisticMedian } from "@/lib/dealFinder";

const TABLE = "card_price_history";

// Panel suivi = les 75 meilleurs scores ∪ les 225 joueurs les plus productifs
// (points). Avant, SEULS les 75 meilleurs scores étaient suivis : le backtest
// ne voyait que des scores 6–7.3 et ne pouvait donc jamais vérifier que « bien
// noté bat mal noté ». Le tri par points donne un panel STABLE (les mêmes
// joueurs d'un snapshot à l'autre, indispensable pour comparer une carte à
// elle-même) qui couvre tout l'éventail de scores (~3.4 à 8.3) avec des
// joueurs qui ont un vrai marché de cartes. Partagé par les crons card-prices
// (prix demandés) et sold-listings (ventes réelles).
const PANEL_TOP_BY_SCORE = 75;
const PANEL_TOP_BY_POINTS = 225;

/**
 * Joueurs suivis par les crons de prix (dédupliqués, ordre stable).
 * @returns {Promise<Array<{ player_id: number; player_name: string }>>}
 */
export async function getPricePanelPlayers() {
  const db = getSupabaseAdmin();
  const [byScore, byPoints] = await Promise.all([
    db
      .from("player_scores")
      .select("player_id, player_name")
      .order("score", { ascending: false })
      .order("points", { ascending: false, nullsFirst: false })
      .order("player_id", { ascending: true })
      .limit(PANEL_TOP_BY_SCORE),
    db
      .from("player_scores")
      .select("player_id, player_name")
      .order("points", { ascending: false, nullsFirst: false })
      .order("player_id", { ascending: true })
      .limit(PANEL_TOP_BY_POINTS),
  ]);
  if (byScore.error || byPoints.error) {
    throw new Error((byScore.error ?? byPoints.error).message);
  }
  const seen = new Set();
  const out = [];
  for (const r of [...(byScore.data ?? []), ...(byPoints.data ?? [])]) {
    if (!r?.player_name || seen.has(r.player_id)) continue;
    seen.add(r.player_id);
    out.push(r);
  }
  return out;
}

/**
 * Enregistre un snapshot de prix pour les cohortes d'un joueur.
 * Upsert par (player_name, card_type, grade, snapshot_date).
 * @param {string} playerName
 * @param {Array<{ title?: string; priceCad?: number }>} listings
 */
export async function snapshotPricesForPlayer(playerName, listings) {
  const name = String(playerName ?? "").trim();
  if (!name || !Array.isArray(listings) || listings.length === 0) {
    return { rows: 0 };
  }

  const fairMap = computeFairValueByFingerprint(listings, name);
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];

  for (const [key, cohort] of fairMap) {
    if (cohort.fairValueCad == null || cohort.comps < 2) continue;
    // card_type = la clé de cohorte COMPLÈTE (identité exacte de la carte).
    // L'ancien `key.split("|")[0]` réduisait toutes les clés de repli
    // "pf|who-year-…" à la même valeur "pf" : dès qu'un joueur avait 2 cohortes
    // de repli, l'upsert du lot entier échouait (« ON CONFLICT DO UPDATE
    // command cannot affect row a second time ») — ~70 % des joueurs du cron
    // card-prices n'avaient AUCUNE ligne (mesuré le 2026-09-22). Les clés
    // fingerprint (sans "|", la majorité) donnent la même valeur qu'avant :
    // l'historique existant reste continu.
    rows.push({
      player_name: name.toLowerCase(),
      card_type: key,
      grade: "Raw",
      snapshot_date: today,
      median_price_cad: cohort.fairValueCad,
      listing_count: cohort.comps,
      source: "active_listings",
      sport: "NHL",
    });
  }

  // Ligne agrégée niveau joueur (card_type "ALL") — garantit qu'un joueur avec
  // assez d'annonces soit toujours backtestable, même si aucune cohorte fine
  // n'atteint le seuil de comps. Le backtest agrège par player_name de toute façon.
  const allPrices = listings
    .map((l) => Number(l?.priceCad ?? l?.price))
    .filter((p) => Number.isFinite(p) && p > 0);
  if (allPrices.length >= 2) {
    rows.push({
      player_name: name.toLowerCase(),
      card_type: "ALL",
      grade: "Mixed",
      snapshot_date: today,
      median_price_cad: Math.round(realisticMedian(allPrices) * 100) / 100,
      listing_count: allPrices.length,
      source: "active_listings_aggregate",
      sport: "NHL",
    });
  }

  if (rows.length === 0) return { rows: 0 };

  const db = getSupabaseAdmin();
  const { error } = await db.from(TABLE).upsert(rows, {
    onConflict: "player_name,card_type,grade,snapshot_date",
  });

  if (error) {
    console.error("[priceHistory] Upsert error:", error.message);
    return { rows: 0, error: error.message };
  }

  return { rows: rows.length };
}

/**
 * Lit l'historique de prix pour un joueur + type de carte.
 * @param {string} playerName
 * @param {string} [cardType] — filtre optionnel (ex. "⭐ Young Guns")
 * @param {{ months?: number }} options
 * @returns {Promise<Array<{ date: string; price: number; comps: number }>>}
 */
export async function getPriceHistory(playerName, cardType, options = {}) {
  const name = String(playerName ?? "").trim().toLowerCase();
  if (!name) return [];

  const months = options.months ?? 12;
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const db = getSupabaseAdmin();
  let query = db
    .from(TABLE)
    .select("snapshot_date, median_price_cad, listing_count")
    .eq("player_name", name)
    .gte("snapshot_date", sinceStr)
    .order("snapshot_date", { ascending: true });

  if (cardType) {
    query = query.eq("card_type", cardType);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[priceHistory] Read error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    date: row.snapshot_date,
    price: Number(row.median_price_cad),
    comps: row.listing_count,
  }));
}

/**
 * Tendance de prix récente agrégée sur tous les types de cartes d'un joueur.
 * Pondère par la médiane des médianes (évite qu'une cohorte rare domine le signal).
 * @param {string} playerName
 * @param {number} [days] — fenêtre de regard arrière (défaut 30)
 * @returns {Promise<{ trendPct: number | null; direction: "up" | "down" | "flat" | null; sampleSize: number }>}
 */
export async function getRecentPriceTrend(playerName, days = 30) {
  const name = String(playerName ?? "").trim().toLowerCase();
  if (!name) return { trendPct: null, direction: null, sampleSize: 0 };

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from(TABLE)
    .select("snapshot_date, card_type, grade, median_price_cad")
    .eq("player_name", name)
    .gte("snapshot_date", sinceStr)
    .order("snapshot_date", { ascending: true });

  if (error || !data || data.length === 0) {
    return { trendPct: null, direction: null, sampleSize: 0 };
  }

  // Indexe par (card_type|grade) puis calcule un %change par cohorte,
  // puis prend la médiane des %change pour éviter qu'une cohorte explosive
  // ne fausse le signal global.
  const byKey = new Map();
  for (const row of data) {
    const k = `${row.card_type}|${row.grade}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({ date: row.snapshot_date, price: Number(row.median_price_cad) });
  }

  const pcts = [];
  for (const series of byKey.values()) {
    if (series.length < 2) continue;
    series.sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = series[0].price;
    const last = series[series.length - 1].price;
    if (!first || !last) continue;
    pcts.push(((last - first) / first) * 100);
  }

  if (pcts.length === 0) {
    return { trendPct: null, direction: null, sampleSize: 0 };
  }

  pcts.sort((a, b) => a - b);
  const mid = Math.floor(pcts.length / 2);
  const medianPct = pcts.length % 2 === 0
    ? (pcts[mid - 1] + pcts[mid]) / 2
    : pcts[mid];
  const rounded = Math.round(medianPct * 10) / 10;

  return {
    trendPct: rounded,
    direction: rounded > 3 ? "up" : rounded < -3 ? "down" : "flat",
    sampleSize: pcts.length,
  };
}

/**
 * Calcule le trend (% change) entre le premier et dernier snapshot.
 * @param {Array<{ price: number }>} history
 * @returns {{ trendPct: number | null; direction: "up" | "down" | "flat" | null }}
 */
export function computeTrend(history) {
  if (!Array.isArray(history) || history.length < 2) {
    return { trendPct: null, direction: null };
  }
  const first = history[0].price;
  const last = history[history.length - 1].price;
  if (!first || !last) return { trendPct: null, direction: null };
  const pct = Math.round(((last - first) / first) * 100);
  return {
    trendPct: pct,
    direction: pct > 3 ? "up" : pct < -3 ? "down" : "flat",
  };
}
