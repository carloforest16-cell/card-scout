import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { computeFairValueByFingerprint } from "@/lib/dealFinder";

const TABLE = "card_price_history";

/**
 * Enregistre un snapshot de prix pour les cohortes d'un joueur.
 * Upsert par (player_name, card_type, grade, snapshot_date).
 * @param {string} playerName
 * @param {Array<{ title?: string; priceCad?: number }>} listings
 */
export async function snapshotPricesForPlayer(playerName, listings) {
  const name = String(playerName ?? "").trim();
  if (!name || !Array.isArray(listings) || listings.length === 0) return;

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
    });
  }

  if (rows.length === 0) return;

  const db = getSupabaseAdmin();
  const { error } = await db.from(TABLE).upsert(rows, {
    onConflict: "player_name,card_type,grade,snapshot_date",
  });

  if (error) {
    console.error("[priceHistory] Upsert error:", error.message);
  }
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
