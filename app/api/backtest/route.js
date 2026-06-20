import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_SAMPLE_SIZE = 10;

/**
 * Coefficient de corrélation de Pearson entre deux séries de même longueur.
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {number | null}
 */
function pearsonCorrelation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
    sumY2 += ys[i] * ys[i];
  }
  const num = n * sumXY - sumX * sumY;
  const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (!Number.isFinite(denom) || denom === 0) return null;
  return Math.round((num / denom) * 1000) / 1000;
}

/**
 * GET /api/backtest?months=3
 *
 * Pour chaque joueur ayant un score à T-months ET un prix médian à la fois
 * à T-months et à T-0, compare :
 *   - X = score au moment T
 *   - Y = % change du prix médian de T à T+months
 *
 * Retourne la corrélation Pearson, des stats agrégées, et des exemples
 * concrets (top predictions vs worst misses).
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const months = Math.max(1, Math.min(12, Number(searchParams.get("months") || 3)));

  const db = getSupabaseAdmin();

  const lookbackDate = new Date();
  lookbackDate.setMonth(lookbackDate.getMonth() - months);
  const lookbackStr = lookbackDate.toISOString().slice(0, 10);

  // 1. Snapshots de scores autour de T-months (fenêtre de ±3 jours pour
  //    augmenter le matching avec les snapshots disponibles)
  const lookbackPlus = new Date(lookbackDate);
  lookbackPlus.setDate(lookbackPlus.getDate() + 3);
  const lookbackPlusStr = lookbackPlus.toISOString().slice(0, 10);

  const { data: oldScores } = await db
    .from("player_scores_history")
    .select("player_id, score, snapshot_date")
    .gte("snapshot_date", lookbackStr)
    .lte("snapshot_date", lookbackPlusStr);

  if (!oldScores || oldScores.length === 0) {
    // Cherche le snapshot le plus ancien pour informer quand le backtest sera dispo
    const { data: oldest } = await db
      .from("player_scores_history")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: true })
      .limit(1);
    let message = `Pas encore assez d'historique pour un backtest sur ${months} mois.`;
    if (oldest && oldest[0]?.snapshot_date) {
      const oldestDate = new Date(oldest[0].snapshot_date);
      const availableMs = Date.now() - oldestDate.getTime();
      const availableDays = Math.floor(availableMs / 86400_000);
      const daysNeeded = months * 30 - availableDays;
      if (daysNeeded > 0) {
        message += ` On collecte des données depuis ${availableDays} jour${availableDays > 1 ? "s" : ""}. Revenir dans ~${daysNeeded} jour${daysNeeded > 1 ? "s" : ""}.`;
      }
    } else {
      message += ` Reviens dans quelques semaines.`;
    }
    return NextResponse.json({
      ok: true,
      sampleSize: 0,
      correlation: null,
      months,
      message,
      topPredictions: [],
      worstMisses: [],
    });
  }

  // 2. Dédupe par player_id : on prend le snapshot le plus proche de lookbackDate
  const oldScoreByPlayer = new Map();
  for (const row of oldScores) {
    const id = String(row.player_id);
    if (!oldScoreByPlayer.has(id)) {
      oldScoreByPlayer.set(id, {
        score: Number(row.score),
        snapshotDate: row.snapshot_date,
      });
    }
  }

  // 3. Récupère les player_name (pour matcher card_price_history)
  const playerIds = [...oldScoreByPlayer.keys()];
  const { data: players } = await db
    .from("player_scores")
    .select("player_id, player_name, team, headshot_url")
    .in("player_id", playerIds);
  const nameMap = new Map();
  (players ?? []).forEach((p) => nameMap.set(String(p.player_id), p));

  // 4. Pour chaque joueur, récupère le prix médian agrégé à T-months et à T-0
  //    On agrège toutes les card_types/grades en moyenne simple.
  const dataPoints = [];

  for (const [playerId, oldEntry] of oldScoreByPlayer) {
    const playerInfo = nameMap.get(playerId);
    if (!playerInfo) continue;
    const playerName = String(playerInfo.player_name ?? "").trim().toLowerCase();
    if (!playerName) continue;

    // Prix à T-months (fenêtre ±5 jours)
    const oldPlus = new Date(oldEntry.snapshotDate);
    oldPlus.setDate(oldPlus.getDate() + 5);
    const { data: oldPrices } = await db
      .from("card_price_history")
      .select("median_price_cad")
      .eq("player_name", playerName)
      .gte("snapshot_date", oldEntry.snapshotDate)
      .lte("snapshot_date", oldPlus.toISOString().slice(0, 10))
      .limit(20);

    if (!oldPrices || oldPrices.length === 0) continue;
    const oldAvg = oldPrices.reduce((s, r) => s + Number(r.median_price_cad), 0) / oldPrices.length;
    if (!Number.isFinite(oldAvg) || oldAvg <= 0) continue;

    // Prix actuel (5 derniers jours)
    const recentSince = new Date();
    recentSince.setDate(recentSince.getDate() - 5);
    const { data: newPrices } = await db
      .from("card_price_history")
      .select("median_price_cad")
      .eq("player_name", playerName)
      .gte("snapshot_date", recentSince.toISOString().slice(0, 10))
      .limit(20);

    if (!newPrices || newPrices.length === 0) continue;
    const newAvg = newPrices.reduce((s, r) => s + Number(r.median_price_cad), 0) / newPrices.length;
    if (!Number.isFinite(newAvg) || newAvg <= 0) continue;

    const priceChangePct = ((newAvg - oldAvg) / oldAvg) * 100;
    dataPoints.push({
      playerId,
      playerName: playerInfo.player_name,
      team: playerInfo.team,
      headshotUrl: playerInfo.headshot_url,
      scoreAtT: Math.round(oldEntry.score * 10) / 10,
      priceChangePct: Math.round(priceChangePct * 10) / 10,
      oldPrice: Math.round(oldAvg * 100) / 100,
      newPrice: Math.round(newAvg * 100) / 100,
    });
  }

  if (dataPoints.length < MIN_SAMPLE_SIZE) {
    return NextResponse.json({
      ok: true,
      sampleSize: dataPoints.length,
      correlation: null,
      months,
      message: `Échantillon trop petit (${dataPoints.length} joueurs). Reviens quand l'historique de prix sera plus riche.`,
      topPredictions: [],
      worstMisses: [],
    });
  }

  // 5. Corrélation Pearson
  const xs = dataPoints.map((p) => p.scoreAtT);
  const ys = dataPoints.map((p) => p.priceChangePct);
  const correlation = pearsonCorrelation(xs, ys);

  // 6. Top predictions : score élevé (>=7) qui ont vu leur prix monter le plus
  const topPredictions = dataPoints
    .filter((p) => p.scoreAtT >= 7)
    .sort((a, b) => b.priceChangePct - a.priceChangePct)
    .slice(0, 5);

  // 7. Worst misses : score élevé mais prix qui a chuté (ou score bas mais prix qui a explosé)
  const worstMisses = dataPoints
    .filter((p) => (p.scoreAtT >= 7 && p.priceChangePct < -10) || (p.scoreAtT <= 4 && p.priceChangePct > 20))
    .sort((a, b) => Math.abs(b.priceChangePct - (b.scoreAtT * 5)) - Math.abs(a.priceChangePct - (a.scoreAtT * 5)))
    .slice(0, 5);

  // 8. Stats : % de "buy signals" qui ont monté
  const buyCount = dataPoints.filter((p) => p.scoreAtT >= 7).length;
  const buyWinners = dataPoints.filter((p) => p.scoreAtT >= 7 && p.priceChangePct > 0).length;
  const buyHitRate = buyCount > 0 ? Math.round((buyWinners / buyCount) * 100) : null;

  return NextResponse.json({
    ok: true,
    sampleSize: dataPoints.length,
    correlation,
    months,
    buyHitRate,
    buyCount,
    scatterData: dataPoints.map((p) => ({
      scoreAtT: p.scoreAtT,
      priceChangePct: p.priceChangePct,
      playerId: p.playerId,
      playerName: p.playerName,
    })),
    topPredictions,
    worstMisses,
    message: null,
  });
}
