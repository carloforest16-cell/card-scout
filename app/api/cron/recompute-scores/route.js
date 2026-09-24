import { NextResponse } from "next/server";

import { recomputeAllScores } from "@/lib/playerScores";
import { recordCronRun } from "@/lib/cronLog";
import { isCronRequest } from "@/lib/requestAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron Vercel : recalcule les Card Metrics Scores et les upsert dans Supabase.
 * Source unique de vérité pour /api/score, /opportunites et le carrousel home.
 * Authorization: Bearer ${CRON_SECRET}
 * Query optionnelle ?limit=N pour un run partiel (test).
 */
export async function GET(request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const start = Date.now();

  try {
    const result = await recomputeAllScores({ limit });

    await recordCronRun("recompute-scores", {
      status: "ok",
      rowsAffected: result?.updated ?? result?.count ?? null,
      durationMs: Date.now() - start,
      detail: result,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    await recordCronRun("recompute-scores", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
