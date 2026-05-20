import { NextResponse } from "next/server";

import { buildHottestDealsPayload } from "@/lib/dealsHottest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const payload = await buildHottestDealsPayload();
    return NextResponse.json({
      mocked: payload.mocked,
      cards: payload.cards,
      playersResolved: payload.playersResolved ?? 0,
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
