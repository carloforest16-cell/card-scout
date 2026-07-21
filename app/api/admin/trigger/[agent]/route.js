import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { recordCronRun } from "@/lib/cronLog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Handlers directs (pas de fetch HTTP) — évite les problèmes VERCEL_URL/CDN/Authorization
// pour les crons qui appellent une seule fonction lib.
// Les crons avec logique Resend inline (price-alerts, watchlist-alerts, etc.) restent en HTTP.
// Chaque handler renvoie `count` = la métrique affichée sur la carte admin
// ("N deals analysés"). Elle est persistée dans cron_runs.rows_affected, que
// /api/admin/agents relit ensuite. Sans ce champ la carte reste vide après un
// déclenchement manuel et le bouton semble ne rien faire (bug signalé par
// Carlo 2026-07-20 : « ça load mais rien n'update dans la liste »).
async function runOpportunites() {
  const { getTopOpportunites } = await import("@/lib/opportunitesTop");
  const result = await getTopOpportunites({ forceRefresh: true });
  return {
    ok: result.ok,
    mocked: result.mocked ?? false,
    candidateCount: result.candidateCount ?? null,
    count: result.opportunities?.length ?? 0,
    error: result.error,
  };
}

async function runHottest() {
  const { buildHottestDealsPayload } = await import("@/lib/dealsHottest");
  const [raw, graded] = await Promise.all([
    buildHottestDealsPayload({ forceRefresh: true, cardMode: "raw" }),
    buildHottestDealsPayload({ forceRefresh: true, cardMode: "graded" }),
  ]);
  // `cards`, pas `deals` — buildHottestDealsPayload n'a jamais exposé `deals`,
  // donc les compteurs remontaient toujours 0.
  const rawCount = raw?.cards?.length ?? 0;
  const gradedCount = graded?.cards?.length ?? 0;
  return { ok: true, rawCount, gradedCount, count: rawCount + gradedCount };
}

async function runTrending() {
  const { buildTrendingPayload } = await import("@/lib/trendingData");
  const payload = await buildTrendingPayload({ forceRefresh: true });
  return { ok: true, count: payload?.carouselPlayers?.length ?? 0 };
}

async function runEnrichScores() {
  const { enrichStoredScores } = await import("@/lib/scoreEnrichment");
  const result = await enrichStoredScores({});
  return { ok: true, scanned: result.scanned, enriched: result.enriched, count: result.enriched ?? 0 };
}

async function runRecomputeScores() {
  const { recomputeAllScores } = await import("@/lib/playerScores");
  const result = await recomputeAllScores({});
  // recomputeAllScores renvoie { processed, written, fullPool, mathPool } —
  // ni `updated` ni `upserted` n'ont jamais existé.
  return {
    ok: true,
    processed: result.processed ?? 0,
    written: result.written ?? 0,
    count: result.written ?? 0,
  };
}

async function runAuctions() {
  const { buildAuctionDealsPayload } = await import("@/lib/auctionDeals");
  const result = await buildAuctionDealsPayload({ forceRefresh: true });
  return { ok: true, count: Array.isArray(result?.auctions) ? result.auctions.length : 0 };
}

async function runSyncPlayers() {
  const { syncAllPlayers } = await import("@/lib/playerDirectory");
  const result = await syncAllPlayers();
  return { ok: true, synced: result.synced, errors: result.errors, count: result.synced ?? 0 };
}

/** Handlers directs — pas de fetch HTTP */
const DIRECT_HANDLERS = {
  opportunites: runOpportunites,
  hottest: runHottest,
  trending: runTrending,
  "enrich-scores": runEnrichScores,
  "recompute-scores": runRecomputeScores,
  auctions: runAuctions,
  "sync-players": runSyncPlayers,
};

/** Crons avec logique inline Resend/Supabase — fallback HTTP via CRON_SECRET */
const HTTP_CRON_ROUTES = {
  "snapshot-scores": "/api/cron/snapshot-scores",
  "price-alerts": "/api/cron/price-alerts",
  "watchlist-alerts": "/api/cron/watchlist-alerts",
  "daily-digest": "/api/cron/daily-digest",
  "weekly-picks": "/api/cron/weekly-picks",
  "card-prices": "/api/cron/card-prices",
  "welcome-emails": "/api/cron/welcome-emails",
};

/**
 * Métrique affichée sur la carte admin pour les crons HTTP. Ces routes ne
 * partagent pas une clé commune — on prend la première qui existe, dans
 * l'ordre où elle représente le mieux « ce que le run a produit ».
 * @param {object | null} body
 * @returns {number | null}
 */
function extractCount(body) {
  if (!body) return null;
  for (const key of ["sent", "snapshotted", "count", "updated", "synced"]) {
    if (Number.isFinite(body[key])) return body[key];
  }
  return null;
}

export async function POST(request, { params }) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  const { agent } = await params;

  const directHandler = DIRECT_HANDLERS[agent];
  const httpRoute = HTTP_CRON_ROUTES[agent];

  if (!directHandler && !httpRoute) {
    return NextResponse.json(
      { ok: false, error: `Agent inconnu: ${agent}` },
      { status: 400 }
    );
  }

  const startedAt = Date.now();

  // ── Chemin direct (pas de HTTP) ──────────────────────────────────────────────
  if (directHandler) {
    try {
      const result = await directHandler();
      const duration = Date.now() - startedAt;
      await recordCronRun(agent, {
        status: result.ok ? "ok" : "error",
        rowsAffected: Number.isFinite(result.count) ? result.count : null,
        durationMs: duration,
        detail: { triggered_by: "manual", ...result },
      });
      return NextResponse.json({ ok: true, agent, duration, result });
    } catch (err) {
      const duration = Date.now() - startedAt;
      await recordCronRun(agent, {
        status: "error",
        durationMs: duration,
        detail: { triggered_by: "manual", error: err?.message ?? String(err) },
      });
      return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
    }
  }

  // ── Chemin HTTP (crons avec logique Resend inline) ───────────────────────────
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET manquant" }, { status: 500 });
  }

  // NEXT_PUBLIC_SITE_URL (cardmetrics.io) stripe l'Authorization header via CDN.
  // Pour contourner : on utilise VERCEL_URL qui pointe au deployment direct.
  // Si VERCEL_URL est mal configuré (alias stale), ces crons peuvent échouer.
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3001";

  try {
    const res = await fetch(`${baseUrl}${httpRoute}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const duration = Date.now() - startedAt;
    const rawText = await res.text().catch(() => "");
    let body = null;
    try { body = JSON.parse(rawText); } catch { /* pas de JSON */ }

    const status = res.ok ? "success" : "error";
    const errorMsg = res.ok ? null : (body?.error ?? `HTTP ${res.status}`);

    await recordCronRun(agent, {
      status: res.ok ? "ok" : "error",
      rowsAffected: res.ok ? extractCount(body) : null,
      durationMs: duration,
      detail: {
        triggered_by: "manual",
        http_status: res.status,
        ...(body ?? {}),
        ...(errorMsg ? { error: errorMsg } : {}),
      },
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: errorMsg, duration }, { status: 502 });
    }
    return NextResponse.json({ ok: true, agent, duration, result: body });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
