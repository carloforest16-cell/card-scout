import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/score/velocity?playerId=X&days=14
 * Retourne le delta de score sur N jours basé sur player_scores_history.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const playerId = String(url.searchParams.get("playerId") ?? "").trim();
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 14)));

  if (!playerId) {
    return NextResponse.json({ ok: false, error: "playerId required" }, { status: 400 });
  }

  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("player_scores_history")
    .select("score, snapshot_date")
    .eq("player_id", playerId)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  if (!data || data.length < 2) {
    return NextResponse.json({ ok: true, delta: null, samples: data?.length ?? 0, days });
  }

  const oldest = Number(data[0].score);
  const newest = Number(data[data.length - 1].score);
  if (!Number.isFinite(oldest) || !Number.isFinite(newest)) {
    return NextResponse.json({ ok: true, delta: null, samples: data.length, days });
  }

  const delta = Math.round((newest - oldest) * 10) / 10;
  return NextResponse.json({
    ok: true,
    delta,
    oldScore: oldest,
    newScore: newest,
    samples: data.length,
    days,
  });
}
