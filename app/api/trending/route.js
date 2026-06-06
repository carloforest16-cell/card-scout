import { NextResponse } from "next/server";

import { getTopOpportunites } from "@/lib/opportunitesTop";

export const dynamic = "force-dynamic";

function tierFromScore(score) {
  const s = Number(score);
  if (s >= 7) return "high";
  if (s >= 5) return "mid";
  return "low";
}

export async function GET() {
  try {
    const result = await getTopOpportunites();
    const opportunities = result?.ok ? result.opportunities ?? [] : [];

    const carouselPlayers = opportunities
      .filter((o) => o?.playerId && o?.headshotUrl)
      .map((o) => ({
        id: String(o.playerId),
        name: o.playerName,
        team: o.team,
        headshotUrl: o.headshotUrl,
        score: Number(o.investmentScore) || 0,
        tier: tierFromScore(o.investmentScore),
        points: o.points ?? null,
      }));

    return NextResponse.json({
      carouselPlayers,
      hot: [],
      steals: [],
      stealsUsedPrice: false,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Impossible de charger les tendances",
        detail: String(err?.message ?? err),
        carouselPlayers: [],
        hot: [],
        steals: [],
        stealsUsedPrice: false,
      },
      { status: 500 }
    );
  }
}
