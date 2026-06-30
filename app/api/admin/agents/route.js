import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/** Mapping cron_name → label + route interne */
const AGENT_REGISTRY = [
  {
    id: "opportunites",
    label: "Top 10 Opportunités",
    cronName: "opportunites",
    route: "/api/cron/opportunites",
    icon: "trophy",
    metricLabel: "opportunités générées",
  },
  {
    id: "enrich-scores",
    label: "Score Enricher",
    cronName: "enrich-scores",
    route: "/api/cron/enrich-scores",
    icon: "chart",
    metricLabel: "scores enrichis",
  },
  {
    id: "hottest",
    label: "Hottest Deals",
    cronName: "hottest",
    route: "/api/cron/hottest",
    icon: "fire",
    metricLabel: "deals analysés",
  },
  {
    id: "trending",
    label: "Trending Players",
    cronName: "trending",
    route: "/api/cron/trending",
    icon: "trending",
    metricLabel: "joueurs mis à jour",
  },
  {
    id: "recompute-scores",
    label: "Recompute Scores",
    cronName: "recompute-scores",
    route: "/api/cron/recompute-scores",
    icon: "refresh",
    metricLabel: "scores recalculés",
  },
  {
    id: "snapshot-scores",
    label: "Snapshot Scores",
    cronName: "snapshot-scores",
    route: "/api/cron/snapshot-scores",
    icon: "camera",
    metricLabel: "snapshots créés",
  },
  {
    id: "price-alerts",
    label: "Price Alerts",
    cronName: "price-alerts",
    route: "/api/cron/price-alerts",
    icon: "bell",
    metricLabel: "alertes envoyées",
  },
  {
    id: "watchlist-alerts",
    label: "Watchlist Alerts",
    cronName: "watchlist-alerts",
    route: "/api/cron/watchlist-alerts",
    icon: "eye",
    metricLabel: "alertes watchlist",
  },
  {
    id: "daily-digest",
    label: "Daily Digest",
    cronName: "daily-digest",
    route: "/api/cron/daily-digest",
    icon: "mail",
    metricLabel: "emails envoyés",
  },
  {
    id: "weekly-picks",
    label: "Weekly Picks",
    cronName: "weekly-picks",
    route: "/api/cron/weekly-picks",
    icon: "star",
    metricLabel: "picks générés",
  },
  {
    id: "card-prices",
    label: "Card Prices",
    cronName: "card-prices",
    route: "/api/cron/card-prices",
    icon: "tag",
    metricLabel: "prix mis à jour",
  },
  {
    id: "auctions",
    label: "Auctions",
    cronName: "auctions",
    route: "/api/cron/auctions",
    icon: "gavel",
    metricLabel: "enchères traitées",
  },
  {
    id: "welcome-emails",
    label: "Welcome Emails",
    cronName: "welcome-emails",
    route: "/api/cron/welcome-emails",
    icon: "envelope",
    metricLabel: "emails envoyés",
  },
];

export async function GET(request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  try {
    const db = getSupabaseAdmin();

    // Dernière run + runs d'aujourd'hui pour chaque cron
    const { data: runs } = await db
      .from("cron_runs")
      .select("cron_name, ran_at, status, rows_affected, duration_ms")
      .order("ran_at", { ascending: false })
      .limit(500);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Grouper par cron_name
    const byName = {};
    for (const run of runs ?? []) {
      if (!byName[run.cron_name]) {
        byName[run.cron_name] = { latest: run, todayCount: 0, errorCount: 0 };
      }
      if (new Date(run.ran_at) >= todayStart) {
        byName[run.cron_name].todayCount++;
        if (run.status === "error") byName[run.cron_name].errorCount++;
      }
    }

    const agents = AGENT_REGISTRY.map((agent) => {
      const info = byName[agent.cronName];
      const latest = info?.latest;

      let status = "idle";
      if (latest) {
        status = latest.status === "error" ? "error" : "ok";
      }

      return {
        ...agent,
        status,
        lastRun: latest?.ran_at ?? null,
        lastRowsAffected: latest?.rows_affected ?? null,
        lastDurationMs: latest?.duration_ms ?? null,
        todayRuns: info?.todayCount ?? 0,
        todayErrors: info?.errorCount ?? 0,
      };
    });

    // Compteurs globaux
    const todayTotal = Object.values(byName).reduce((s, v) => s + v.todayCount, 0);
    const activeAgents = agents.filter((a) => a.status === "ok").length;

    return NextResponse.json({
      ok: true,
      agents,
      meta: {
        totalAgents: agents.length,
        activeAgents,
        todayRuns: todayTotal,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
