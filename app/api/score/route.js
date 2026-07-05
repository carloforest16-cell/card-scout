import { NextResponse } from "next/server";

import {
  buildScorePayloadFromLanding,
  deriveEnrichmentStatus,
  scoreCardScoutWithClaude,
  validateScoreRequestBody,
} from "@/lib/cardScoutScore";
import { getEbayMedianAndCountForPlayer } from "@/lib/dealFinder";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";
import { fetchPlayerGameLog } from "@/lib/nhlPlayerLanding";
import { getStoredPlayerScore, isStoredScoreStale, writeBackPlayerScore } from "@/lib/playerScores";

export const maxDuration = 60;

/**
 * POST — body JSON : payload complet (buildScorePayloadFromLanding)
 * ou minimal `{ "playerId": "8478402" }` (hydratation NHL côté serveur).
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON invalide" },
      { status: 400 }
    );
  }

  // PR 14 : param `sport` accepté dans le body (default 'NHL').
  const sport = String(body?.sport ?? "NHL").toUpperCase();
  if (sport !== "NHL") {
    return NextResponse.json(
      { ok: false, error: `Sport '${sport}' pas encore implémenté` },
      { status: 400 }
    );
  }

  const validated = validateScoreRequestBody(body);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: 400 }
    );
  }

  // Source unique de vérité : la table Supabase peuplée par le cron hebdo.
  // Lecture instantanée (pas d'appel Claude/eBay) tant que le score est frais.
  try {
    const stored = await getStoredPlayerScore(String(body.playerId));
    if (stored?.data?.ok && !isStoredScoreStale(stored.computedAt)) {
      return NextResponse.json(
        {
          ...stored.data,
          enriched: deriveEnrichmentStatus(stored.data.factors),
          computedAt: stored.computedAt ?? null,
        },
        { status: 200 }
      );
    }
  } catch {
    // DB indisponible → on retombe sur le calcul live ci-dessous.
  }

  let payload = validated.payload;
  let landingData = null;
  if (validated.needsHydration) {
    landingData = await getPlayerLandingCached(String(payload.playerId));
    if (!landingData) {
      return NextResponse.json(
        { ok: false, error: "Joueur introuvable" },
        { status: 404 }
      );
    }
    // Game log saison courante pour les fenêtres glissantes 5/10/15 (sous-score
    // Momentum détaillé). Tolère un échec — momentumDetailed retombe sur recentForm.
    const seasonId = landingData?.featuredStats?.season;
    const gameLog = seasonId
      ? await fetchPlayerGameLog(String(payload.playerId), String(seasonId))
      : null;
    payload = buildScorePayloadFromLanding(String(payload.playerId), landingData, gameLog);
  }

  const { medianPriceCad, listingCount, dealGapPct } =
    await getEbayMedianAndCountForPlayer(payload.playerName);

  const result = await scoreCardScoutWithClaude(
    payload,
    medianPriceCad,
    listingCount,
    dealGapPct
  );

  // Write-through : persiste le score frais en DB pour cohérence avec le top
  // opportunités (qui lit player_scores). Fire-and-forget — ne bloque pas la réponse.
  writeBackPlayerScore({
    playerId: payload.playerId,
    playerName: payload.playerName,
    team: payload.teamAbbrev,
    headshotUrl: landingData?.headshot ?? null,
    scoreResult: result,
    points: payload.currentSeason?.points ?? null,
    gamesPlayed: payload.currentSeason?.gamesPlayed ?? null,
  }).catch(() => {});

  const status = result.ok ? 200 : 503;
  return NextResponse.json(result, { status });
}