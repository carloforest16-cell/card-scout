import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { computeFairValueByFingerprint, realisticMedian } from "@/lib/dealFinder";

const TABLE = "card_price_history";

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

  const fairMap = computeFairValueByFingerprint(listings);
  const today = new Date().toISOString().slice(0, 10);
  const rows = [];

  for (const [key, cohort] of fairMap) {
    if (cohort.fairValueCad == null || cohort.comps < 2) continue;
    const [cardType, , gradePart] = key.split("|");
    rows.push({
      player_name: name.toLowerCase(),
      card_type: cardType || "Autre",
      grade: gradePart || "Raw",
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
