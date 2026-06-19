import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const AGE_WINDOW = 2;
const TOP_N = 5;

/** Groupes de positions équivalentes pour la comparaison. */
const POSITION_GROUPS = {
  F: new Set(["C", "L", "R", "LW", "RW"]),
  D: new Set(["D"]),
  G: new Set(["G"]),
};

function positionGroup(pos) {
  const p = String(pos ?? "").toUpperCase();
  if (POSITION_GROUPS.G.has(p)) return "G";
  if (POSITION_GROUPS.D.has(p)) return "D";
  if (POSITION_GROUPS.F.has(p)) return "F";
  return null;
}

/**
 * GET /api/score/peers?playerId=X
 *
 * Retourne :
 *  - position, age du joueur cible
 *  - top 5 peers (même groupe position, âge ±2 ans) triés par score
 *  - rang percentile du joueur cible dans son groupe
 *  - sleepers : peers avec meilleur score mais prix eBay inférieur
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = String(searchParams.get("playerId") ?? "").trim();
  if (!playerId) {
    return NextResponse.json({ ok: false, error: "playerId requis" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Récupère tous les scores (table petite ~75 joueurs)
  const { data: allScores, error } = await db
    .from("player_scores")
    .select("player_id, player_name, team, score, tier, headshot_url, data");

  if (error || !Array.isArray(allScores)) {
    return NextResponse.json({ ok: false, error: "Erreur DB" }, { status: 500 });
  }

  // Trouve la cible
  const target = allScores.find((s) => String(s.player_id) === playerId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "Joueur sans score" }, { status: 404 });
  }

  const targetPosition = target.data?.position ?? target.data?.payload?.position ?? null;
  const targetAge = Number(target.data?.payload?.ageYears ?? target.data?.ageYears);
  const targetGroup = positionGroup(targetPosition);

  if (!targetGroup || !Number.isFinite(targetAge)) {
    return NextResponse.json({
      ok: true,
      target: {
        playerId,
        playerName: target.player_name,
        score: Number(target.score),
        position: targetPosition,
        ageYears: Number.isFinite(targetAge) ? targetAge : null,
      },
      peers: [],
      percentile: null,
      sleepers: [],
      reason: "Données insuffisantes (position ou âge inconnu)",
    });
  }

  // Filtre les peers : même groupe position + âge ±2 ans + autre joueur
  const peerCandidates = [];
  for (const row of allScores) {
    if (String(row.player_id) === playerId) continue;
    const pos = row.data?.position ?? row.data?.payload?.position ?? null;
    const age = Number(row.data?.payload?.ageYears ?? row.data?.ageYears);
    if (!Number.isFinite(age)) continue;
    const grp = positionGroup(pos);
    if (grp !== targetGroup) continue;
    if (Math.abs(age - targetAge) > AGE_WINDOW) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    const ebayMedian = Number(
      row.data?.factors?.marketValue?.score != null
        ? row.data?.payload?.ebayMedianPriceCad
        : null
    );
    peerCandidates.push({
      playerId: String(row.player_id),
      playerName: row.player_name,
      team: row.team ?? null,
      headshotUrl: row.headshot_url ?? null,
      score,
      tier: row.tier ?? null,
      position: pos,
      ageYears: age,
      ebayMedianCad: Number.isFinite(ebayMedian) ? ebayMedian : null,
    });
  }

  // Sort by score desc
  peerCandidates.sort((a, b) => b.score - a.score);

  // Rang percentile du joueur cible parmi (cible + peers)
  const allInGroup = [...peerCandidates, {
    score: Number(target.score),
    playerId,
  }];
  allInGroup.sort((a, b) => a.score - b.score); // asc pour percentile
  const targetRankIdx = allInGroup.findIndex((x) => x.playerId === playerId);
  const percentile = allInGroup.length > 1
    ? Math.round((targetRankIdx / (allInGroup.length - 1)) * 100)
    : null;

  // Top N peers
  const topPeers = peerCandidates.slice(0, TOP_N);

  // Sleepers : score plus haut que cible mais prix médian inférieur
  const targetEbayMedian = Number(target.data?.payload?.ebayMedianPriceCad);
  const sleepers = peerCandidates.filter((p) => {
    if (!(p.score > Number(target.score))) return false;
    if (!Number.isFinite(p.ebayMedianCad) || !Number.isFinite(targetEbayMedian)) return false;
    return p.ebayMedianCad < targetEbayMedian;
  }).slice(0, 3);

  return NextResponse.json({
    ok: true,
    target: {
      playerId,
      playerName: target.player_name,
      score: Number(target.score),
      tier: target.tier ?? null,
      position: targetPosition,
      ageYears: targetAge,
      ebayMedianCad: Number.isFinite(targetEbayMedian) ? targetEbayMedian : null,
    },
    peers: topPeers,
    percentile,
    poolSize: peerCandidates.length + 1,
    sleepers,
  });
}
