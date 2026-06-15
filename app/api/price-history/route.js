import { NextResponse } from "next/server";

import { getPriceHistory, computeTrend } from "@/lib/priceHistory";

export const dynamic = "force-dynamic";

/**
 * GET /api/price-history?player=cole+caufield&cardType=⭐+Young+Guns&months=12
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const player = searchParams.get("player")?.trim();
  if (!player) {
    return NextResponse.json({ error: "Paramètre requis : player" }, { status: 400 });
  }

  const cardType = searchParams.get("cardType") || undefined;
  const months = Number(searchParams.get("months")) || 12;

  const history = await getPriceHistory(player, cardType, { months });
  const trend = computeTrend(history);

  return NextResponse.json({
    player,
    cardType: cardType ?? null,
    months,
    dataPoints: history.length,
    history,
    ...trend,
  });
}
