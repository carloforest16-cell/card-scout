import { NextResponse } from "next/server";

import { getTopOpportunites } from "@/lib/opportunitesTop";
import { getScoreDeltas } from "@/lib/playerScores";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";
  // Param `sport` accepté pour préparer le multi-sport (PR 14).
  // Pour l'instant, seul 'NHL' est implémenté. Les autres valeurs retombent sur NHL.
  const sport = String(searchParams.get("sport") ?? "NHL").toUpperCase();

  const result = await getTopOpportunites({ forceRefresh: refresh, sport });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Chargement impossible" },
      { status: 500 }
    );
  }

  const opportunities = Array.isArray(result.opportunities) ? result.opportunities : [];

  // Deltas 7j (tâche 3.3 du plan) — calculés à chaque requête, JAMAIS mis en
  // cache avec la liste des opportunités (cache_opportunites, TTL 14j) sinon
  // le delta figerait pendant 2 semaines. Un seul appel batché pour tout le
  // top 10, pas un par carte.
  const playerIds = opportunities.map((o) => o.playerId).filter(Boolean);
  const deltas = await getScoreDeltas(playerIds).catch(() => ({}));
  const opportunitiesWithDeltas = opportunities.map((o) => {
    const d = deltas[String(o.playerId)];
    return d
      ? { ...o, scoreDelta: { delta: d.delta, direction: d.direction, hasHistory: d.hasHistory } }
      : o;
  });

  return NextResponse.json({
    sport,
    opportunities: opportunitiesWithDeltas,
    lastUpdated: result.lastUpdated,
    analysisNote: result.analysisNote,
    mocked: Boolean(result.mocked),
    ...(result.candidateCount != null
      ? { candidateCount: result.candidateCount }
      : {}),
    ...(result.stale ? { stale: true, staleError: result.error } : {}),
  });
}
