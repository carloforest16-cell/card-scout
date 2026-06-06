import { NextResponse } from "next/server";

import { buildHottestDealsPayload } from "@/lib/dealsHottest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron Vercel : préchauffe le cache Hottest Deals (raw + graded) dans Blob.
 * GET /api/cron/hottest
 * Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  const [raw, graded] = await Promise.all([
    buildHottestDealsPayload({ forceRefresh: true, cardMode: "raw" }),
    buildHottestDealsPayload({ forceRefresh: true, cardMode: "graded" }),
  ]);

  return NextResponse.json({
    ok: true,
    raw: { cards: raw.cards?.length ?? 0, mocked: raw.mocked },
    graded: { cards: graded.cards?.length ?? 0, mocked: graded.mocked },
    ms: Date.now() - start,
  });
}
