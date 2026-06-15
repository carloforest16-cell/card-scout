import { NextResponse } from "next/server";

import { buildAuctionDealsPayload } from "@/lib/auctionDeals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
  const result = await buildAuctionDealsPayload({ forceRefresh });
  return NextResponse.json(result);
}
