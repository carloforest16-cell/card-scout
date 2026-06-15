import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * GET /api/movers
 * Retourne le top joueur récemment réévalué avec un score élevé.
 * Pas de "mover" historique (player_scores n'a pas d'historique de score),
 * donc on expose le joueur le plus récemment recalculé parmi les hauts scores.
 */
export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("player_scores")
      .select("player_id, player_name, team, score, tier, computed_at, headshot_url")
      .gte("score", 7)
      .order("computed_at", { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) return NextResponse.json({ ok: true, mover: null });

    return NextResponse.json({
      ok: true,
      mover: {
        playerId: row.player_id,
        playerName: row.player_name,
        team: row.team,
        score: Number(row.score),
        tier: row.tier,
        computedAt: row.computed_at,
        headshotUrl: row.headshot_url ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
