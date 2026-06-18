import { NextResponse } from "next/server";

import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";
import { resolveFullName } from "@/lib/nhlPlayerLanding";
import { getStoredPlayerScore } from "@/lib/playerScores";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^\d+$/.test(String(id))) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const [landing, stored] = await Promise.all([
    getPlayerLandingCached(String(id)).catch(() => null),
    getStoredPlayerScore(String(id)).catch(() => null),
  ]);
  if (!landing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const name = resolveFullName(landing);
  const data = stored?.data ?? null;
  const featured = landing.featuredStats?.regularSeason?.subSeason ?? landing.featuredStats?.regularSeason ?? null;

  return NextResponse.json({
    player: {
      id: String(id),
      name,
      team: landing.currentTeamAbbrev ?? landing.teamName ?? null,
      position: landing.position ?? landing.positionCode ?? null,
      headshot: landing.headshot ?? null,
      score: data?.score ?? null,
      tier: data?.tier ?? null,
      breakdown: data?.breakdown ?? data?.factors ?? null,
      verdict: data?.verdict ?? data?.summary ?? null,
      age: landing.age ?? null,
      stats: featured ? {
        gamesPlayed: featured.gamesPlayed ?? null,
        goals: featured.goals ?? null,
        assists: featured.assists ?? null,
        points: featured.points ?? null,
        plusMinus: featured.plusMinus ?? null,
      } : null,
    },
  });
}
