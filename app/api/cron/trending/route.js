import { NextResponse } from "next/server";

import { buildTrendingPayload } from "@/lib/trendingData";
import { recordCronRun } from "@/lib/cronLog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron : rebuild le cache trending (~100 joueurs, scores math).
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
  try {
    const payload = await buildTrendingPayload({ forceRefresh: true });
    const ms = Date.now() - start;

    await recordCronRun("trending", {
      status: "ok",
      rowsAffected: payload.carouselPlayers?.length ?? 0,
      durationMs: ms,
    });

    return NextResponse.json({
      ok: true,
      players: payload.carouselPlayers?.length ?? 0,
      top5: payload.carouselPlayers?.slice(0, 5).map((p) => `${p.name} ${p.score}`),
      ms,
    });
  } catch (err) {
    await recordCronRun("trending", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
