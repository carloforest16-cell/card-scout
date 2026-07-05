import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { readHottestCacheOnly, HOTTEST_CACHE_TTL_MS } from "@/lib/dealsHottest";
import { readAuctionCacheOnly, AUCTION_CACHE_TTL_MS } from "@/lib/auctionDeals";
import { readOpportunitesCacheOnly, CACHE_TTL_MS as OPPORTUNITES_CACHE_TTL_MS } from "@/lib/opportunitesTop";

/**
 * Cadence attendue par cron (en heures, avec marge), dérivée de vercel.json.
 * Au-delà de ce seuil sans exécution → flag "stale" (le cron n'a pas tourné,
 * pas forcément qu'il a échoué).
 */
const EXPECTED_INTERVAL_HOURS = {
  trending: 30,
  hottest: 30,
  "recompute-scores": 24 * 8,
  opportunites: 24 * 16,
  "price-alerts": 30,
  "watchlist-alerts": 30,
  "weekly-picks": 24 * 8,
  "card-prices": 24 * 4,
  auctions: 30,
  "daily-digest": 30,
  "snapshot-scores": 30,
  "enrich-scores": 30,
  "welcome-emails": 30,
};

/**
 * Caches clés dont la fraîcheur est surveillée. Le cache sold prices
 * (130point) est exclu : il est keyé par requête de recherche, pas de cache
 * global unique à surveiller.
 */
async function checkCaches() {
  const [hottest, auctions, opportunites] = await Promise.all([
    readHottestCacheOnly("raw").catch(() => null),
    readAuctionCacheOnly().catch(() => null),
    readOpportunitesCacheOnly().catch(() => null),
  ]);

  const now = Date.now();
  function toEntry(name, entry, ttlMs) {
    if (!entry?.fetchedAt) {
      return { cache: name, fetchedAt: null, ageHours: null, ttlHours: ttlMs / 3_600_000, stale: true, missing: true };
    }
    const ageMs = now - entry.fetchedAt;
    return {
      cache: name,
      fetchedAt: new Date(entry.fetchedAt).toISOString(),
      ageHours: Math.round((ageMs / 3_600_000) * 10) / 10,
      ttlHours: ttlMs / 3_600_000,
      stale: ageMs > ttlMs,
      missing: false,
    };
  }

  return [
    toEntry("hottest", hottest, HOTTEST_CACHE_TTL_MS),
    toEntry("auctions", auctions, AUCTION_CACHE_TTL_MS),
    toEntry("opportunites", opportunites, OPPORTUNITES_CACHE_TTL_MS),
  ];
}

/**
 * Agrège le dernier run de chaque cron (cron_runs) et la fraîcheur des
 * caches clés en un verdict global ok | warn | error. Partagé entre
 * GET /api/health et le cron sentinelle (/api/cron/health-check).
 * @returns {Promise<{ ok: true; verdict: "ok"|"warn"|"error"; crons: object[]; caches: object[] } | { ok: false; error: string }>}
 */
export async function buildHealthReport() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("cron_runs")
    .select("cron_name, ran_at, status, rows_affected, duration_ms, detail")
    .order("ran_at", { ascending: false })
    .limit(300);

  if (error) {
    return { ok: false, error: error.message };
  }

  const latestByCron = new Map();
  for (const row of data ?? []) {
    if (!latestByCron.has(row.cron_name)) latestByCron.set(row.cron_name, row);
  }

  const now = Date.now();
  const crons = Object.keys(EXPECTED_INTERVAL_HOURS).map((cronName) => {
    const row = latestByCron.get(cronName);
    if (!row) {
      return {
        cron: cronName,
        lastRun: null,
        ageHours: null,
        status: "never_ran",
        stale: true,
      };
    }
    const ranAtMs = new Date(row.ran_at).getTime();
    const ageHours = Math.round(((now - ranAtMs) / 3_600_000) * 10) / 10;
    const expected = EXPECTED_INTERVAL_HOURS[cronName];
    const stale = ageHours > expected;
    return {
      cron: cronName,
      lastRun: row.ran_at,
      ageHours,
      status: row.status,
      rowsAffected: row.rows_affected,
      durationMs: row.duration_ms,
      stale,
    };
  });

  const caches = await checkCaches();

  const anyCronError = crons.some((c) => c.status === "error");
  const anyCronNeverRan = crons.some((c) => c.status === "never_ran");
  const anyCronStale = crons.some((c) => c.stale && c.status !== "never_ran");
  const anyCacheMissing = caches.some((c) => c.missing);
  const anyCacheStale = caches.some((c) => c.stale);

  let verdict = "ok";
  if (anyCronError || anyCronNeverRan || anyCacheMissing) {
    verdict = "error";
  } else if (anyCronStale || anyCacheStale) {
    verdict = "warn";
  }

  return { ok: true, verdict, crons, caches };
}
