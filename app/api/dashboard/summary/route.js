import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { readHottestCacheOnly } from "@/lib/dealsHottest";

const MAX_WATCHLIST_DEALS = 4;

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
    admin.from("cache_generic").select("payload, fetched_at").eq("key", "top-10").maybeSingle(),
  ]);

  const watchlist = watchlistRes.data ?? [];
  const portfolio = portfolioRes.data ?? [];
  const alerts = alertsRes.data ?? [];

  // Top picks (déjà cachés par opportunitesTop)
  const oppsPayload = oppsCacheRes.data?.payload;
  const oppsAll = Array.isArray(oppsPayload?.opportunities)
    ? oppsPayload.opportunities
    : Array.isArray(oppsPayload?.items)
      ? oppsPayload.items
      : [];
  const opps = oppsAll.slice(0, 4);
  const oppsCount = oppsAll.length;
  const oppsGeneratedAt = oppsCacheRes.data?.fetched_at ?? null;

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
          hasHistory: true,
        };
      } else if (cur) {
        deltas[pid] = { score: Number(cur.score), delta: null, direction: "flat", hasHistory: true };
      }
    }

    // Fallback honnête : aucun snapshot historique pour ce joueur — on va
    // chercher son score courant réel dans player_scores plutôt que
    // d'inventer une tendance. Pas de delta affiché, juste le score.
    const missingIds = watchlistIds.filter((pid) => !deltas[pid]);
    if (missingIds.length > 0) {
      const { data: currentScores } = await admin
        .from("player_scores")
        .select("player_id, score")
        .in("player_id", missingIds);
      (currentScores ?? []).forEach((row) => {
        deltas[row.player_id] = {
          score: Number(row.score),
          delta: null,
          direction: null,
          hasHistory: false,
        };
      });
    }
  }

  const totalInvested = portfolio.reduce((s, c) => s + (Number(c.purchase_price_cad) || 0), 0);
  const sparklineData = await buildPortfolioSparkline(admin, portfolio, 30);

  // Market pulse — pour l'instant, dérivé de la distribution des scores actuels
  const marketPulse = await buildMarketPulse(admin);

  // Deals détectés pour les joueurs suivis — lecture cache seule (aucun
  // fetch eBay ici, trop lent pour un chargement dashboard).
  const watchlistDeals = await buildWatchlistDeals(watchlist);

  // Briefing du jour — template déterministe à partir des données déjà
  // chargées ci-dessus, jamais d'appel IA (gratuit, instantané, toujours vrai).
  const dailyBrief = buildDailyBrief({ watchlist, deltas, watchlistDeals, sparklineData });

  const data = {
    watchlist,
    portfolio,
    alerts,
    opps,
    oppsCount,
    oppsGeneratedAt,
    deltas,
    watchlistDeals,
    dailyBrief,
    portfolioSummary: {
      totalInvested,
      cardsCount: portfolio.length,
      sparkline30j: sparklineData.points,
      sparklineNote: sparklineData.note,
      daysTracked: sparklineData.daysTracked,
      daysTarget: sparklineData.target,
    },
    marketPulse,
  };

  await writeJsonCache(cacheKey, { generatedAt: new Date().toISOString(), data });

  return NextResponse.json({ ...data, cached: false });
}

/**
 * Croise la watchlist avec le cache hottest deals (seule source de deals
 * persistante et multi-joueurs disponible sans fetch eBay à la volée — le
 * cache par-joueur du Deal Finder est en mémoire process, donc invisible
 * depuis cette route). Un joueur suivi qui n'est pas dans le panel hottest
 * (~12-30 joueurs tendance) n'aura simplement pas de deal ici — c'est
 * honnête, pas un bug.
 * @param {Array<{ player_id: string | number }>} watchlist
 * @returns {Promise<Array<{ playerId: string; playerName: string; groupType: string; priceCad: number; investmentScore: number; verdict: string; percentOfMarket: number|null; url: string|null; cachedAt: string|null }>>}
 */
async function buildWatchlistDeals(watchlist) {
  if (watchlist.length === 0) return [];

  const watchlistIds = new Set(watchlist.map((w) => String(w.player_id)).filter(Boolean));
  if (watchlistIds.size === 0) return [];

  const hottest = await readHottestCacheOnly("raw");
  // hottest.mocked === true → cartes de démo (pas d'eBay configuré), jamais
  // à présenter comme de vrais deals détectés pour l'utilisateur.
  if (!hottest || hottest.mocked) return [];
  const cards = Array.isArray(hottest.cards) ? hottest.cards : [];
  if (cards.length === 0) return [];

  const cachedAt = Number.isFinite(hottest.fetchedAt) ? new Date(hottest.fetchedAt).toISOString() : null;

  const matched = [];
  const seenPlayers = new Set();
  for (const card of cards) {
    const playerId = String(card.playerId ?? "");
    if (!watchlistIds.has(playerId) || seenPlayers.has(playerId)) continue;
    seenPlayers.add(playerId);
    matched.push({
      playerId,
      playerName: card.playerName ?? "—",
      groupType: card.groupType ?? "—",
      priceCad: Number(card.price ?? card.priceCad) || null,
      investmentScore: Number(card.investmentScore ?? card.cardScoutScore) || null,
      verdict: card.verdict ?? null,
      percentOfMarket: Number.isFinite(Number(card.percentOfMarket)) ? Number(card.percentOfMarket) : null,
      url: card.url ?? null,
      cachedAt,
    });
    if (matched.length >= MAX_WATCHLIST_DEALS) break;
  }

  return matched;
}

const BRIEF_SCORE_DELTA_THRESHOLD = 0.15;
const BRIEF_PORTFOLIO_PCT_THRESHOLD = 0.5;
const BRIEF_MAX_SENTENCES = 2;

/**
 * Compose 1-2 phrases de briefing à partir des données déjà chargées dans
 * cette requête — template déterministe, jamais d'appel IA (gratuit,
 * instantané, toujours vrai). Retourne null si rien de notable à dire
 * (le front garde alors son sous-titre générique).
 * @param {{ watchlist: object[]; deltas: Record<string, object>; watchlistDeals: object[]; sparklineData: { note: string; points: number[] } }} args
 * @returns {string | null}
 */
function buildDailyBrief({ watchlist, deltas, watchlistDeals, sparklineData }) {
  const parts = [];

  // 1. Plus gros mouvement de score dans la watchlist (delta réel seulement)
  let biggest = null;
  for (const w of watchlist) {
    const info = deltas[String(w.player_id)];
    if (!info?.hasHistory || info.delta == null) continue;
    if (!biggest || Math.abs(info.delta) > Math.abs(biggest.delta)) {
      biggest = { name: w.player_name, delta: info.delta };
    }
  }
  if (biggest && Math.abs(biggest.delta) >= BRIEF_SCORE_DELTA_THRESHOLD) {
    const verb = biggest.delta > 0 ? "gagné" : "perdu";
    parts.push(`${biggest.name} a ${verb} ${Math.abs(biggest.delta).toFixed(1)} pt cette semaine.`);
  }

  // 2. Deals détectés pour la watchlist
  if (watchlistDeals.length > 0) {
    const n = watchlistDeals.length;
    parts.push(`${n} deal${n > 1 ? "s" : ""} sous la cote détecté${n > 1 ? "s" : ""} pour tes joueurs.`);
  }

  // 3. P&L portfolio sur 7 jours — uniquement si l'historique est réel
  if (sparklineData.note === "real" && Array.isArray(sparklineData.points) && sparklineData.points.length >= 7) {
    const pts = sparklineData.points;
    const last = pts[pts.length - 1];
    const weekAgo = pts[pts.length - 7];
    if (weekAgo > 0) {
      const pct = ((last - weekAgo) / weekAgo) * 100;
      if (Math.abs(pct) >= BRIEF_PORTFOLIO_PCT_THRESHOLD) {
        parts.push(`Ton vault : ${pct > 0 ? "+" : ""}${pct.toFixed(1)}% sur 7 jours.`);
      }
    }
  }

  if (parts.length === 0) return null;
  return parts.slice(0, BRIEF_MAX_SENTENCES).join(" ");
}

/**
 * Trajectoire de valeur du portfolio sur `days` jours, basée uniquement sur
 * de vrais snapshots `card_price_history`. Aucune donnée simulée : si
 * l'historique est insuffisant, on retourne un compteur de progression
 * (`daysTracked`/`target`) pour que le front affiche une barre honnête au
 * lieu d'une courbe inventée.
 * @returns {Promise<{ points: number[]; note: "empty"|"warming-up"|"real"; daysTracked: number; target: number }>}
 */
async function buildPortfolioSparkline(admin, portfolio, days) {
  if (portfolio.length === 0) {
    return { points: [], note: "empty", daysTracked: 0, target: days };
  }

  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const names = [...new Set(portfolio.map((c) => c.player_name).filter(Boolean))];
  if (names.length === 0) {
    return { points: [], note: "warming-up", daysTracked: 0, target: days };
  }

  const { data } = await admin
    .from("card_price_history")
    .select("player_name, card_type, grade, snapshot_date, median_price_cad")
    .gte("snapshot_date", since)
    .in("player_name", names);

  if (!data || data.length === 0) {
    return { points: [], note: "warming-up", daysTracked: 0, target: days };
  }

  // Aggrégat par snapshot_date
  const byDate = new Map();
  data.forEach((row) => {
    if (!byDate.has(row.snapshot_date)) byDate.set(row.snapshot_date, []);
    byDate.get(row.snapshot_date).push(row);
  });

  const daysTracked = byDate.size;
  if (daysTracked < 7) {
    return { points: [], note: "warming-up", daysTracked, target: days };
  }

  const sortedDates = [...byDate.keys()].sort();
  const points = sortedDates.map((d) => {
    const sum = byDate.get(d).reduce((s, r) => s + (Number(r.median_price_cad) || 0), 0);
    return Number(sum.toFixed(2));
  });
  return { points, note: "real", daysTracked, target: days };
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
