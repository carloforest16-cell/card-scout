import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Endpoint dashboard agrégé. Retourne en 1 appel :
 *   { watchlist, portfolio, alerts, opps, marketPulse, deltas }
 *
 * Cache Supabase 5 min keyé sur l'user (les données sont user-specific).
 */
export async function GET() {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cacheKey = `dashboard-${user.id}`;
  const cached = await readJsonCache(cacheKey);
  if (cached?.generatedAt && Date.now() - new Date(cached.generatedAt).getTime() < CACHE_TTL_MS) {
    return NextResponse.json({ ...cached.data, cached: true });
  }

  const admin = getSupabaseAdmin();

  const [watchlistRes, portfolioRes, alertsRes, oppsCacheRes] = await Promise.all([
    userClient.from("watchlist").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
    userClient.from("portfolio_cards").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    userClient.from("price_alerts").select("*").eq("user_id", user.id),
    admin.from("cache_generic").select("payload").eq("key", "top-10").maybeSingle(),
  ]);

  const watchlist = watchlistRes.data ?? [];
  const portfolio = portfolioRes.data ?? [];
  const alerts = alertsRes.data ?? [];

  // Top picks (déjà cachés par opportunitesTop)
  const oppsPayload = oppsCacheRes.data?.payload;
  const opps = Array.isArray(oppsPayload?.opportunities)
    ? oppsPayload.opportunities.slice(0, 4)
    : Array.isArray(oppsPayload?.items)
      ? oppsPayload.items.slice(0, 4)
      : [];

  // Deltas 7j sur les joueurs suivis depuis player_scores_history
  const watchlistIds = watchlist.map((w) => String(w.player_id)).filter(Boolean);
  let deltas = {};
  if (watchlistIds.length > 0) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const [currentRes, pastRes] = await Promise.all([
      admin
        .from("player_scores_history")
        .select("player_id, score, snapshot_date")
        .in("player_id", watchlistIds)
        .order("snapshot_date", { ascending: false })
        .limit(watchlistIds.length * 2),
      admin
        .from("player_scores_history")
        .select("player_id, score, snapshot_date")
        .in("player_id", watchlistIds)
        .lte("snapshot_date", sevenDaysAgo)
        .order("snapshot_date", { ascending: false })
        .limit(watchlistIds.length * 2),
    ]);

    const latestByPlayer = new Map();
    (currentRes.data ?? []).forEach((row) => {
      if (!latestByPlayer.has(row.player_id)) latestByPlayer.set(row.player_id, row);
    });
    const pastByPlayer = new Map();
    (pastRes.data ?? []).forEach((row) => {
      if (!pastByPlayer.has(row.player_id)) pastByPlayer.set(row.player_id, row);
    });

    for (const pid of watchlistIds) {
      const cur = latestByPlayer.get(pid);
      const past = pastByPlayer.get(pid);
      if (cur && past) {
        const d = Number(cur.score) - Number(past.score);
        deltas[pid] = {
          score: Number(cur.score),
          delta: Number(d.toFixed(2)),
          direction: d > 0.05 ? "up" : d < -0.05 ? "down" : "flat",
        };
      } else if (cur) {
        deltas[pid] = { score: Number(cur.score), delta: null, direction: "flat" };
      }
    }
  }

  const totalInvested = portfolio.reduce((s, c) => s + (Number(c.purchase_price_cad) || 0), 0);
  const sparklineData = await buildPortfolioSparkline(admin, portfolio, 30);
  const sparkline30j = sparklineData.points;
  const sparklineNote = sparklineData.note;

  // Market pulse — pour l'instant, dérivé de la distribution des scores actuels
  const marketPulse = await buildMarketPulse(admin);

  const data = {
    watchlist,
    portfolio,
    alerts,
    opps,
    deltas,
    portfolioSummary: {
      totalInvested,
      cardsCount: portfolio.length,
      sparkline30j,
      sparklineNote,
    },
    marketPulse,
  };

  await writeJsonCache(cacheKey, { generatedAt: new Date().toISOString(), data });

  return NextResponse.json({ ...data, cached: false });
}

async function buildPortfolioSparkline(admin, portfolio, days) {
  if (portfolio.length === 0) {
    return { points: [], note: "empty" };
  }
  const total = portfolio.reduce((s, c) => s + (Number(c.purchase_price_cad) || 0), 0);

  // Tente une vraie trajectoire depuis card_price_history (snapshots croisés
  // avec les holdings du user). Si trop peu de points, on tombe en
  // synthétique avec une note "en construction".
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const names = [...new Set(portfolio.map((c) => c.player_name).filter(Boolean))];
  if (names.length === 0) {
    return { points: buildSynthetic(total, days, portfolio.length), note: "synthetic" };
  }

  const { data } = await admin
    .from("card_price_history")
    .select("player_name, card_type, grade, snapshot_date, median_price_cad")
    .gte("snapshot_date", since)
    .in("player_name", names);

  if (!data || data.length === 0) {
    return { points: buildSynthetic(total, days, portfolio.length), note: "no-snapshots" };
  }

  // Aggrégat par snapshot_date
  const byDate = new Map();
  data.forEach((row) => {
    if (!byDate.has(row.snapshot_date)) byDate.set(row.snapshot_date, []);
    byDate.get(row.snapshot_date).push(row);
  });

  if (byDate.size < 7) {
    return { points: buildSynthetic(total, days, portfolio.length), note: "warming-up" };
  }

  const sortedDates = [...byDate.keys()].sort();
  const points = sortedDates.map((d) => {
    const sum = byDate.get(d).reduce((s, r) => s + (Number(r.median_price_cad) || 0), 0);
    return Number(sum.toFixed(2));
  });
  return { points, note: "real" };
}

function buildSynthetic(total, days, seed) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const noise = Math.sin(i * 0.45 + seed) * 0.03;
    out.push(Number((total * (0.97 + (i / days) * 0.06 + noise)).toFixed(2)));
  }
  return out;
}

async function buildMarketPulse(admin) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const { data: recent } = await admin
    .from("player_scores_history")
    .select("player_id, score, snapshot_date")
    .gte("snapshot_date", sevenDaysAgo)
    .limit(500);

  if (!recent || recent.length === 0) {
    return [
      { label: "Données 7j", trend: "—", tone: "neutral", note: "Snapshots à venir" },
    ];
  }

  const byPlayer = new Map();
  recent.forEach((r) => {
    const arr = byPlayer.get(r.player_id) ?? [];
    arr.push(r);
    byPlayer.set(r.player_id, arr);
  });

  let up = 0, down = 0, flat = 0;
  byPlayer.forEach((rows) => {
    if (rows.length < 2) { flat++; return; }
    rows.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const d = Number(rows[rows.length - 1].score) - Number(rows[0].score);
    if (d > 0.1) up++;
    else if (d < -0.1) down++;
    else flat++;
  });

  const total = up + down + flat;
  return [
    { label: "Scores en hausse", trend: `${Math.round((up / total) * 100)}%`, tone: "up", note: `${up}/${total} joueurs` },
    { label: "Scores en baisse", trend: `${Math.round((down / total) * 100)}%`, tone: "down", note: `${down}/${total} joueurs` },
    { label: "Stables", trend: `${Math.round((flat / total) * 100)}%`, tone: "neutral", note: `${flat}/${total} joueurs` },
    { label: "Panel analysé", trend: String(total), tone: "neutral", note: "joueurs avec snapshots" },
  ];
}
