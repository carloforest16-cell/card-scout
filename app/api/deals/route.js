import { NextResponse } from "next/server";

import { getDealFinderResult, parseCardMode } from "@/lib/dealFinder";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const player = searchParams.get("player")?.trim();
  const cardMode = parseCardMode(searchParams.get("mode"));
  const marketplace = searchParams.get("marketplace") === "EBAY_US" ? "EBAY_US" : "EBAY_CA";
  const forceRefresh = searchParams.get("refresh") === "1";

  const result = await getDealFinderResult(player ?? "", cardMode, { marketplace, forceRefresh });

  if (!result.ok) {
    const status = result.status ?? 400;
    const body = {
      error: result.error,
      ...(result.detail ? { detail: result.detail } : {}),
      ...(typeof result.totalListings === "number"
        ? { totalListings: result.totalListings }
        : {}),
      ...(typeof result.validListings === "number"
        ? { validListings: result.validListings }
        : {}),
    };
    return NextResponse.json(body, { status });
  }

  return NextResponse.json(result.data);
}
