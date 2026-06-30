import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  try {
    const db = getSupabaseAdmin();

    // 1. Count player_scores
    const { count: scoresCount } = await db
      .from("player_scores")
      .select("*", { count: "exact", head: true });

    // 2. Dernier write cache_generic
    const { data: lastCache } = await db
      .from("cache_generic")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Santé cron sur 7 jours
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentRuns } = await db
      .from("cron_runs")
      .select("cron_name, ran_at, status, duration_ms")
      .gte("ran_at", sevenDaysAgo)
      .order("ran_at", { ascending: false });

    const total7d = recentRuns?.length ?? 0;
    const errors7d = recentRuns?.filter((r) => r.status === "error") ?? [];
    const successRate7d =
      total7d > 0 ? Math.round(((total7d - errors7d.length) / total7d) * 100) : null;

    // Derniers 3 échecs
    const lastErrors = errors7d.slice(0, 3).map((r) => ({
      cronName: r.cron_name,
      ranAt: r.ran_at,
    }));

    // Durée moyenne
    const durations = recentRuns?.filter((r) => r.duration_ms != null).map((r) => r.duration_ms) ?? [];
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    return NextResponse.json({
      ok: true,
      supabase: {
        playerScoresCount: scoresCount ?? 0,
        lastCacheWrite: lastCache?.updated_at ?? null,
        status: "ok",
      },
      cron: {
        total7d,
        successRate7d,
        lastErrors,
        avgDurationMs: avgDuration,
      },
      ebay: {
        status: "placeholder",
        note: "Logs eBay non disponibles séparément — vérifier cron card-prices",
      },
      deepseek: {
        status: "placeholder",
        note: "Table api_calls inexistante — comptage DeepSeek non disponible",
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
