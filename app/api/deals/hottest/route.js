import { NextResponse } from "next/server";

import { parseCardMode } from "@/lib/dealFinder";
import { buildHottestDealsPayload } from "@/lib/dealsHottest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cardMode = parseCardMode(searchParams.get("mode"));
    const payload = await buildHottestDealsPayload({ cardMode });
    return NextResponse.json({
      mocked: payload.mocked,
      cards: payload.cards,
      playersResolved: payload.playersResolved ?? 0,
      cardMode: payload.cardMode ?? cardMode,
      fetchedAt: payload.fetchedAt ?? Date.now(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Impossible de charger les Hottest Deals",
        detail: String(err?.message ?? err),
        mocked: true,
        cards: [],
      },
      { status: 500 }
    );
  }
}
