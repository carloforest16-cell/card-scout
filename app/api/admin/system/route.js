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
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 2b. Fraîcheur Top 10
    const { data: lastOpportunites } = await db
      .from("cache_opportunites")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
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

    // 4. Métriques business
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      { count: subscribersTotal },
      { count: subscribersToday },
      { count: activeAlerts },
      { count: watchlistItems },
      { count: ebayClicksTotal },
      { count: ebayClicks7d },
      { count: alertsTriggered7d },
    ] = await Promise.all([
      db.from("newsletter_subscribers").select("*", { count: "exact", head: true }),
      db.from("newsletter_subscribers").select("*", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
      db.from("price_alerts").select("*", { count: "exact", head: true }).eq("active", true),
      db.from("watchlist").select("*", { count: "exact", head: true }),
      db.from("ebay_clicks").select("*", { count: "exact", head: true }),
      db.from("ebay_clicks").select("*", { count: "exact", head: true }).gte("clicked_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      db.from("alerts_triggered").select("*", { count: "exact", head: true }).gte("triggered_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    // 5. Analytics pageviews
    const { data: pageviewsToday } = await db
      .from("pageviews")
      .select("path, referrer")
      .gte("ts", todayStart.toISOString());

    const { data: pageviews7d } = await db
      .from("pageviews")
      .select("path, ts, referrer")
      .gte("ts", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Top pages aujourd'hui
    const pageCounts = {};
    for (const pv of pageviewsToday ?? []) {
      pageCounts[pv.path] = (pageCounts[pv.path] ?? 0) + 1;
    }
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([path, count]) => ({ path, count }));

    // Pages vues par jour sur 7j
    const dailyCounts = {};
    for (const pv of pageviews7d ?? []) {
      const day = pv.ts.slice(0, 10);
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
    }
    const weekly = Object.entries(dailyCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    // Sources de trafic
    const sources = { direct: 0, google: 0, autre: 0 };
    for (const pv of pageviews7d ?? []) {
      if (!pv.referrer) sources.direct++;
      else if (pv.referrer.includes("google")) sources.google++;
      else sources.autre++;
    }

    return NextResponse.json({
      ok: true,
      supabase: {
        playerScoresCount: scoresCount ?? 0,
        lastCacheWrite: lastCache?.fetched_at ?? null,
        status: "ok",
      },
      content: {
        opportunitesFetchedAt: lastOpportunites?.fetched_at ?? null,
      },
      cron: {
        total7d,
        successRate7d,
        lastErrors,
        avgDurationMs: avgDuration,
      },
      business: {
        subscribersTotal: subscribersTotal ?? 0,
        subscribersToday: subscribersToday ?? 0,
        activeAlerts: activeAlerts ?? 0,
        watchlistItems: watchlistItems ?? 0,
        ebayClicksTotal: ebayClicksTotal ?? 0,
        ebayClicks7d: ebayClicks7d ?? 0,
        alertsTriggered7d: alertsTriggered7d ?? 0,
      },
      analytics: {
        todayViews: pageviewsToday?.length ?? 0,
        weekly,
        topPages,
        sources,
      },
      ebay: {
        status: "placeholder",
        note: "Logs eBay non disponibles séparément",
      },
      deepseek: {
        status: "placeholder",
        note: "Comptage DeepSeek non disponible",
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
