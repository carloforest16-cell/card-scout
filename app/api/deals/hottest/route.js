import { NextResponse } from "next/server";

import { parseCardMode } from "@/lib/dealFinder";
import { buildHottestDealsPayload } from "@/lib/dealsHottest";
import { allowPublicForceRefresh } from "@/lib/rateLimit";
import { isOperatorRequest } from "@/lib/requestAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const cardMode = parseCardMode(searchParams.get("mode"));
    // Un recalcul reconstruit eBay + DeepSeek pour ~40 joueurs : au plus un
    // par mode toutes les 30 min pour le public (le bouton « Actualiser » de
    // /deals), sans limite pour le cron et l'admin.
    const forceRefresh =
      searchParams.get("refresh") === "1" &&
      (await allowPublicForceRefresh({
        scope: `hottest:${cardMode}`,
        windowMs: 30 * 60 * 1000,
        isOperator: isOperatorRequest(request),
      }));
    const payload = await buildHottestDealsPayload({ cardMode, forceRefresh });
    return NextResponse.json({
      mocked: payload.mocked,
      cards: payload.cards,
      playersResolved: payload.playersResolved ?? 0,
      cardMode: payload.cardMode ?? cardMode,
      fetchedAt: payload.fetchedAt ?? Date.now(),
    });
  } catch (err) {
    console.error("[api/deals/hottest] échec:", err?.message ?? err);
    return NextResponse.json(
      {
        error: "Impossible de charger les Hottest Deals",
        mocked: true,
        cards: [],
      },
      { status: 500 }
    );
  }
}
