import { NextResponse } from "next/server";

import { buildAuctionDealsPayload } from "@/lib/auctionDeals";
import { recordCronRun } from "@/lib/cronLog";

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

  const start = Date.now();

  try {
    const result = await buildAuctionDealsPayload({ forceRefresh: true });

    await recordCronRun("auctions", {
      status: "ok",
      rowsAffected: Array.isArray(result?.auctions) ? result.auctions.length : 0,
      durationMs: Date.now() - start,
      detail: { playersResolved: result?.playersResolved ?? 0 },
    });

    return NextResponse.json({
      ok: true,
      count: Array.isArray(result?.auctions) ? result.auctions.length : 0,
      playersResolved: result?.playersResolved ?? 0,
      generatedAt: result?.generatedAt,
    });
  } catch (err) {
    await recordCronRun("auctions", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
