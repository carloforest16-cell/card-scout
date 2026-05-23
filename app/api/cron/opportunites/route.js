import { NextResponse } from "next/server";

import { getTopOpportunites } from "@/lib/opportunitesTop";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron Vercel : rafraîchit le cache opportunités (Blob + mémoire).
 * Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await getTopOpportunites({ forceRefresh: true });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Refresh failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
