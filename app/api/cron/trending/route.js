import { NextResponse } from "next/server";

import { buildTrendingPayload } from "@/lib/trendingData";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron : rebuild le cache trending (85 joueurs, AI scores).
 * GET /api/cron/trending
 * Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const payload = await buildTrendingPayload({ forceRefresh: true });
  const ms = Date.now() - start;

  return NextResponse.json({
    ok: true,
    players: payload.carouselPlayers?.length ?? 0,
    top5: payload.carouselPlayers?.slice(0, 5).map((p) => `${p.name} ${p.score}`),
    ms,
  });
}
