import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { getRecentPriceTrend } from "@/lib/priceHistory";

/**
 * Trajectoire récente du score interne pour un joueur (delta sur N jours).
 * Compare le score actuel à la valeur la plus ancienne dans la fenêtre.
 * @param {string} playerId
 * @param {number} currentScore
 * @param {number} [days]
 * @returns {Promise<{ deltaPct: number | null; direction: "up" | "down" | "flat" | null; sampleSize: number }>}
 */
async function getScoreTrajectory(playerId, currentScore, days = 30) {
  const id = String(playerId ?? "").trim();
  if (!id || !Number.isFinite(Number(currentScore))) {
    return { deltaPct: null, direction: null, sampleSize: 0 };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("player_scores_history")
    .select("snapshot_date, score")
    .eq("player_id", id)
    .gte("snapshot_date", sinceStr)
    .order("snapshot_date", { ascending: true });

  if (error || !Array.isArray(data) || data.length === 0) {
    return { deltaPct: null, direction: null, sampleSize: 0 };
  }

  const earliest = Number(data[0]?.score);
  if (!Number.isFinite(earliest) || earliest <= 0) {
    return { deltaPct: null, direction: null, sampleSize: data.length };
  }

  const pct = ((Number(currentScore) - earliest) / earliest) * 100;
  const rounded = Math.round(pct * 10) / 10;

  return {
    deltaPct: rounded,
    direction: rounded > 3 ? "up" : rounded < -3 ? "down" : "flat",
    sampleSize: data.length,
  };
}

/**
 * Score de Discrépance Marché 0-10. Compare la trajectoire du score interne
 * avec la tendance de prix eBay réelle sur la même fenêtre.
 *
 *   Score ↑ + Prix ↓/flat → SIGNAL D'ACHAT (le marché n'a pas réagi)    : 8-10
 *   Score ↑ + Prix ↑       → marché aligné, déjà réagi                 : 5-6
 *   Score flat + Prix flat → équilibre                                  : 5
 *   Score ↓ + Prix ↑       → SIGNAL DE VENTE (prix soutenu non justifié) : 2-3
 *   Score ↓ + Prix ↓       → marché aligné à la baisse                 : 4
 *
 * @param {string} playerId
 * @param {string} playerName
 * @param {number} currentScore
 * @param {number} [days]
 * @returns {Promise<{ score: number; scoreDelta: number|null; priceDelta: number|null; sampleSize: number; signal: string }>}
 */
export async function computeMarketDiscrepancy(playerId, playerName, currentScore, days = 30) {
  const [scoreTraj, priceTrend] = await Promise.all([
    getScoreTrajectory(playerId, currentScore, days),
    getRecentPriceTrend(playerName, days),
  ]);

  const scoreDelta = scoreTraj.deltaPct;
  const priceDelta = priceTrend.trendPct;
  const sampleSize = Math.min(scoreTraj.sampleSize, priceTrend.sampleSize);

  // Données insuffisantes → neutre
  if (scoreDelta == null || priceDelta == null) {
    return {
      score: 5,
      scoreDelta,
      priceDelta,
      sampleSize,
      signal: "data_insuffisante",
    };
  }

  const scoreUp = scoreDelta > 3;
  const scoreDown = scoreDelta < -3;
  const priceUp = priceDelta > 3;
  const priceDown = priceDelta < -3;
  const priceFlat = !priceUp && !priceDown;

  // SIGNAL D'ACHAT — score grimpe mais prix encore au plancher
  if (scoreUp && priceDown) {
    // Plus l'écart est grand, plus le signal est fort
    const spread = scoreDelta - priceDelta; // toujours positif ici
    if (spread >= 25) return { score: 10, scoreDelta, priceDelta, sampleSize, signal: "achat_fort" };
    if (spread >= 15) return { score: 9, scoreDelta, priceDelta, sampleSize, signal: "achat_fort" };
    return { score: 8, scoreDelta, priceDelta, sampleSize, signal: "achat" };
  }
  if (scoreUp && priceFlat) {
    return { score: 8, scoreDelta, priceDelta, sampleSize, signal: "achat" };
  }

  // SIGNAL DE VENTE — score chute mais prix encore haut ou soutenu
  if (scoreDown && priceUp) {
    return { score: 2, scoreDelta, priceDelta, sampleSize, signal: "vente_fort" };
  }
  if (scoreDown && priceFlat) {
    return { score: 3, scoreDelta, priceDelta, sampleSize, signal: "vente" };
  }

  // Marché aligné
  if (scoreUp && priceUp) {
    return { score: 6, scoreDelta, priceDelta, sampleSize, signal: "aligne_hausse" };
  }
  if (scoreDown && priceDown) {
    return { score: 4, scoreDelta, priceDelta, sampleSize, signal: "aligne_baisse" };
  }

  // Tout flat → neutre
  return { score: 5, scoreDelta, priceDelta, sampleSize, signal: "stable" };
}
