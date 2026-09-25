import { NextResponse } from "next/server";

import { buildHottestDealsPayload } from "@/lib/dealsHottest";
import { recordCronRun } from "@/lib/cronLog";
import { isCronRequest } from "@/lib/requestAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron Vercel : préchauffe le cache Hottest Deals (raw + graded) dans Blob.
 * GET /api/cron/hottest
 * Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
    const [raw, graded] = await Promise.all([
      buildHottestDealsPayload({ forceRefresh: true, cardMode: "raw" }),
      buildHottestDealsPayload({ forceRefresh: true, cardMode: "graded" }),
    ]);

    await recordCronRun("hottest", {
      status: "ok",
      rowsAffected: (raw.cards?.length ?? 0) + (graded.cards?.length ?? 0),
      durationMs: Date.now() - start,
      detail: { rawMocked: raw.mocked, gradedMocked: graded.mocked },
    });

    return NextResponse.json({
      ok: true,
      raw: { cards: raw.cards?.length ?? 0, mocked: raw.mocked },
      graded: { cards: graded.cards?.length ?? 0, mocked: graded.mocked },
      ms: Date.now() - start,
    });
  } catch (err) {
    await recordCronRun("hottest", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
