import { NextResponse } from "next/server";

import { enrichStoredScores } from "@/lib/scoreEnrichment";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron Vercel (quotidien) : enrichit les scores stockés avec les 4 sous-scores
 * avancés (marketDiscrepancy, teamContext, catalysts, socialAttention) que le
 * cron recompute (fastMode) ne calcule pas. Pas de DeepSeek ici → rapide.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

  const result = await enrichStoredScores({ limit });

  console.log(
    `[cron/enrich-scores] scanned=${result.scanned} enriched=${result.enriched}`
  );

  return NextResponse.json({ ok: true, ...result });
}
