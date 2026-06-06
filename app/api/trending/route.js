import { NextResponse } from "next/server";

import { getTopOpportunites } from "@/lib/opportunitesTop";

export const dynamic = "force-dynamic";

function tierFromScore(score) {
  const s = Number(score);
  if (s >= 7) return "high";
  if (s >= 5) return "mid";
  return "low";
}

function headshotFor(o) {
  if (o.team && o.team !== "—") {
    return `https://assets.nhle.com/mugs/nhl/20252026/${o.team}/${o.playerId}.png`;
  }
  return o.headshotUrl;
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
        headshotUrl: headshotFor(o),
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
