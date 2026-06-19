import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Cron quotidien : snapshot l'état actuel de player_scores dans
 * player_scores_history pour permettre le calcul de deltas (deltas 7j sur le
 * dashboard, sparklines, etc.).
 *
 * On ne recalcule rien — recompute-scores s'en charge déjà chaque semaine et
 * écrit dans player_scores. Ici on fige la photo du jour, idempotent grâce à
 * la contrainte UNIQUE (player_id, snapshot_date) avec ON CONFLICT DO UPDATE.
 *
 * Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: scores, error: readError } = await supabase
    .from("player_scores")
    .select("player_id, data");

  if (readError) {
    return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
  }
  if (!scores || scores.length === 0) {
    return NextResponse.json({ ok: true, snapshotted: 0, note: "no scores to snapshot" });
  }

  const today = new Date().toISOString().slice(0, 10);

  const rows = scores
    .map((row) => {
      const payload = row?.data ?? {};
      const score = Number(payload?.score);
      if (!Number.isFinite(score)) return null;
      return {
        player_id: String(row.player_id),
        score: Number(score.toFixed(2)),
        score_breakdown: payload?.breakdown ?? payload?.factors ?? null,
        snapshot_date: today,
        sport: "NHL",
      };
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, snapshotted: 0, note: "no valid scores" });
  }

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error: upsertError } = await supabase
      .from("player_scores_history")
      .upsert(slice, { onConflict: "player_id,snapshot_date" });
    if (upsertError) {
      return NextResponse.json(
        { ok: false, error: upsertError.message, snapshotted: inserted },
        { status: 500 }
      );
    }
    inserted += slice.length;
  }

  return NextResponse.json({ ok: true, snapshotted: inserted, snapshotDate: today });
}
