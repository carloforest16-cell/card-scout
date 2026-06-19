import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

const CACHE_TABLE = "cache_generic";
const CACHE_TTL_HOURS = 24;
const SEARCH_DAYS = 7;

// User-Agent recommandé par Reddit : "<platform>:<app id>:<version> (by /u/<name>)"
const USER_AGENT =
  process.env.REDDIT_USER_AGENT?.trim() ||
  "web:card-scout:1.0 (by Card Scout)";

/**
 * Récupère un token Reddit OAuth si les credentials sont configurés.
 * @returns {Promise<string | null>}
 */
async function getRedditToken() {
  const id = process.env.REDDIT_CLIENT_ID?.trim();
  const secret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Compte les mentions du joueur dans /r/hockey + /r/hockeycards sur N jours.
 * Utilise OAuth si dispo, sinon endpoint public (best-effort).
 * @param {string} playerName
 * @returns {Promise<number | null>}
 */
async function fetchMentionCount(playerName) {
  const name = String(playerName ?? "").trim();
  if (!name) return null;

  const q = encodeURIComponent(`"${name}"`);
  // Multiple subreddits via combinaison `r/sub1+sub2`
  const sub = "hockey+hockeycards";

  const token = await getRedditToken();
  const base = token
    ? `https://oauth.reddit.com/r/${sub}/search.json`
    : `https://www.reddit.com/r/${sub}/search.json`;

  const url = `${base}?q=${q}&restrict_sr=on&sort=new&t=week&limit=100`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const children = json?.data?.children;
    if (!Array.isArray(children)) return null;

    // Filtre approximatif : ne garde que les posts récents (créés dans les SEARCH_DAYS)
    const cutoff = Date.now() / 1000 - SEARCH_DAYS * 24 * 60 * 60;
    let count = 0;
    let commentSum = 0;
    for (const child of children) {
      const created = Number(child?.data?.created_utc);
      if (!Number.isFinite(created) || created < cutoff) continue;
      count += 1;
      const comments = Number(child?.data?.num_comments);
      if (Number.isFinite(comments)) commentSum += comments;
    }
    // Pondération : 1 post = 1, 10 commentaires = 1 (approx)
    return count + Math.floor(commentSum / 10);
  } catch {
    return null;
  }
}

/**
 * Échelle logarithmique de mentions → score 0-10.
 * @param {number | null} mentions
 * @returns {number}
 */
function mentionsToScore(mentions) {
  if (!Number.isFinite(Number(mentions))) return 5;
  const n = Number(mentions);
  if (n <= 0) return 3;
  if (n < 2) return 4;
  if (n < 5) return 5;
  if (n < 10) return 6;
  if (n < 20) return 7;
  if (n < 50) return 8;
  if (n < 100) return 9;
  return 10;
}

/**
 * Score d'attention sociale (0-10) pour un joueur, avec cache 24h.
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
          mentions: Number(data.payload?.mentions ?? null),
          cached: true,
        };
      }
    }
  } catch {
    // pas de cache
  }

  const mentions = await fetchMentionCount(name);
  const score = mentionsToScore(mentions);

  // Cache (best effort) — on cache même si API a échoué (mentions=null → score=5)
  try {
    await db.from(CACHE_TABLE).upsert(
      {
        key,
        fetched_at: new Date().toISOString(),
        payload: { score, mentions },
      },
      { onConflict: "key" }
    );
  } catch {
    // ignore
  }

  return { score, mentions, cached: false };
}
