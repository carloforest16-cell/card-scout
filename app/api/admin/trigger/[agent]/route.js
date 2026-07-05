import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Whitelist des agents déclenchables manuellement */
const AGENT_ROUTES = {
  opportunites: "/api/cron/opportunites",
  "enrich-scores": "/api/cron/enrich-scores",
  hottest: "/api/cron/hottest",
  trending: "/api/cron/trending",
  "recompute-scores": "/api/cron/recompute-scores",
  "snapshot-scores": "/api/cron/snapshot-scores",
  "price-alerts": "/api/cron/price-alerts",
  "watchlist-alerts": "/api/cron/watchlist-alerts",
  "daily-digest": "/api/cron/daily-digest",
  "weekly-picks": "/api/cron/weekly-picks",
  "card-prices": "/api/cron/card-prices",
  auctions: "/api/cron/auctions",
  "welcome-emails": "/api/cron/welcome-emails",
};

export async function POST(request, { params }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const { agent } = await params;

  const route = AGENT_ROUTES[agent];
  if (!route) {
    return NextResponse.json(
      { ok: false, error: `Agent inconnu: ${agent}` },
      { status: 400 }
    );
  }

  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET manquant" },
      { status: 500 }
    );
  }

  // Appel interne serveur→serveur : VERCEL_URL (deployment direct, pas CDN custom domain).
  // Ne PAS utiliser NEXT_PUBLIC_SITE_URL — Vercel stripe l'Authorization header
  // quand la requête passe par le custom domain (cardmetrics.io) via son edge CDN.
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3001";

  try {
    const startedAt = Date.now();
    const res = await fetch(`${baseUrl}${route}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });

    const duration = Date.now() - startedAt;
    let body = null;
    try {
      body = await res.json();
    } catch {
      // pas de JSON
    }

    const db = getSupabaseAdmin();
    const status = res.ok ? "success" : "error";
    const errorMsg = res.ok ? null : (body?.error ?? `HTTP ${res.status}`);

    await db.from("cron_runs").insert({
      cron_name: agent,
      status,
      duration_ms: duration,
      detail: { triggered_by: "manual", ...(errorMsg ? { error: errorMsg } : {}) },
    }).then(() => {});

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: errorMsg, duration },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, agent, duration, result: body });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
