import { NextResponse } from "next/server";

import { getDealFinderResult, parseCardMode } from "@/lib/dealFinder";
import { allowPublicForceRefresh, rateLimitOr429 } from "@/lib/rateLimit";
import { isOperatorRequest } from "@/lib/requestAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const player = searchParams.get("player")?.trim();
  const cardMode = parseCardMode(searchParams.get("mode"));
  const marketplace = searchParams.get("marketplace") === "EBAY_US" ? "EBAY_US" : "EBAY_CA";
  const isOperator = isOperatorRequest(request);

  // Une recherche hors cache = plusieurs appels eBay (quota de 5000/jour
  // partagé par tout le site) + DeepSeek : limite par IP.
  if (!isOperator) {
    const limited = await rateLimitOr429(request, {
      name: "deals",
      limit: 60,
      windowMs: 10 * 60 * 1000,
    });
    if (limited) return limited;
  }

  // Recalcul forcé : au plus un par joueur/mode/marché toutes les 15 min pour
  // le public ; sinon on sert le cache, comme sans refresh.
  const forceRefresh =
    searchParams.get("refresh") === "1" &&
    (await allowPublicForceRefresh({
      scope: `deals:${(player ?? "").toLowerCase()}:${cardMode}:${marketplace}`,
      windowMs: 15 * 60 * 1000,
      isOperator,
    }));

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
