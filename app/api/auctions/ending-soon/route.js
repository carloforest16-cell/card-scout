import { NextResponse } from "next/server";

import { buildAuctionDealsPayload } from "@/lib/auctionDeals";
import { allowPublicForceRefresh } from "@/lib/rateLimit";
import { isOperatorRequest } from "@/lib/requestAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // Au plus un recalcul public toutes les 15 min (appels eBay).
  const forceRefresh =
    searchParams.get("refresh") === "1" &&
    (await allowPublicForceRefresh({
      scope: "auctions",
      windowMs: 15 * 60 * 1000,
      isOperator: isOperatorRequest(request),
    }));
  const result = await buildAuctionDealsPayload({ forceRefresh });
  return NextResponse.json(result);
}
