import { NextResponse } from "next/server";

import { getTopOpportunites } from "@/lib/opportunitesTop";
import { recomputeAllScores } from "@/lib/playerScores";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron Vercel : recalcule les Card Scout Scores et les upsert dans Supabase.
 * Source unique de vérité pour /api/score, /opportunites et le carrousel home.
 * Authorization: Bearer ${CRON_SECRET}
 * Query optionnelle ?limit=N pour un run partiel (test).
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const result = await recomputeAllScores({ limit });

    // Les scores viennent de changer → on reconstruit le cache opportunités
    // dans la foulée pour que /opportunites reste cohérent avec les pages
    // joueur (sinon il garde l'ancien classement jusqu'au cron du 1er/15).
    let opportunitesRefreshed = false;
    try {
      const opp = await getTopOpportunites({ forceRefresh: true });
      opportunitesRefreshed = Boolean(opp?.ok);
    } catch {
      // Non bloquant : les scores sont écrits, le cache se rafraîchira plus tard.
    }

    return NextResponse.json({ ok: true, ...result, opportunitesRefreshed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
