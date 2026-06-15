import { NextResponse } from "next/server";

import { buildAuctionDealsPayload } from "@/lib/auctionDeals";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron Vercel (toutes les heures) : rafraîchit le cache des enchères chaudes.
 * Les enchères évoluent vite — on ne veut pas que des enchères déjà terminées
 * apparaissent encore dans la liste.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await buildAuctionDealsPayload({ forceRefresh: true });
  return NextResponse.json({
    ok: true,
    count: Array.isArray(result?.auctions) ? result.auctions.length : 0,
    playersResolved: result?.playersResolved ?? 0,
    generatedAt: result?.generatedAt,
  });
}
