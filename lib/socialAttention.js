import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

const CACHE_TABLE = "cache_generic";
const CACHE_TTL_HOURS = 24;

/**
 * Convertit "Connor McDavid" → "Connor_McDavid" pour l'API Wikipedia.
 * @param {string} name
 * @returns {string}
 */
function toWikipediaTitle(name) {
  return String(name ?? "")
    .trim()
    .replace(/ /g, "_");
}

/**
 * Dates YYYYMMDD pour l'API Wikipedia (derniers N jours).
 * @param {number} days
 * @returns {{ start: string; end: string }}
 */
function dateRange(days = 7) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return { start: fmt(start), end: fmt(end) };
}

/**
 * Total de vues Wikipedia sur les 7 derniers jours pour un joueur.
 * Retourne null si l'article n'existe pas ou si la requête échoue.
 * @param {string} playerName
 * @returns {Promise<number | null>}
 */
async function fetchWikipediaViews(playerName) {
  const article = toWikipediaTitle(playerName);
  if (!article) return null;

  const { start, end } = dateRange(7);
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodeURIComponent(article)}/daily/${start}/${end}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Card-Scout/1.0 (hockey card investment tool)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const items = json?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    return items.reduce((sum, item) => sum + (Number(item.views) || 0), 0);
  } catch {
    return null;
  }
}

/**
 * Vues Wikipedia (7 jours) → score 0-10.
 * Calibré pour les joueurs NHL : un joueur moyen fait ~2 000-5 000 vues/semaine.
 * Un pic (trade, blessure, gros match) peut atteindre 50 000-200 000+.
 * @param {number | null} views
 * @returns {number}
 */
function viewsToScore(views) {
  if (!Number.isFinite(Number(views))) return 5;
  const n = Number(views);
  if (n < 300)    return 2;
  if (n < 800)    return 3;
  if (n < 2000)   return 4;
  if (n < 5000)   return 5;
  if (n < 12000)  return 6;
  if (n < 30000)  return 7;
  if (n < 70000)  return 8;
  if (n < 150000) return 9;
  return 10;
}

/**
 * Score d'attention sociale (0-10) basé sur les vues Wikipedia des 7 derniers jours.
 * Cache 24h dans Supabase.
 * @param {string} playerName
 * @returns {Promise<{ score: number; mentions: number | null; cached: boolean }>}
 */
export async function fetchSocialScore(playerName) {
  const name = String(playerName ?? "").trim();
  if (!name) return { score: 5, mentions: null, cached: false };

  const key = `social-attention-${name.toLowerCase()}`;
  const db = getSupabaseAdmin();

  // Cache lookup
  try {
    const { data } = await db
      .from(CACHE_TABLE)
      .select("payload, fetched_at")
      .eq("key", key)
      .single();
    if (data?.payload && data?.fetched_at) {
      const ageMs = Date.now() - new Date(data.fetched_at).getTime();
      if (ageMs < CACHE_TTL_HOURS * 3600 * 1000) {
        return {
          score: Number(data.payload?.score ?? 5),
          mentions: data.payload?.mentions ?? null,
          cached: true,
        };
      }
    }
  } catch {
    // pas de cache
  }

  const views = await fetchWikipediaViews(name);
  const score = viewsToScore(views);

  // Cache (best-effort) — on cache même si Wikipedia n'a pas retourné de données
  try {
    await db.from(CACHE_TABLE).upsert(
      {
        key,
        fetched_at: new Date().toISOString(),
        payload: { score, mentions: views, source: "wikipedia" },
      },
      { onConflict: "key" }
    );
  } catch {
    // ignore
  }

  return { score, mentions: views, cached: false };
}
