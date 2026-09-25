import "server-only";

import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

/**
 * Limiteur de requêtes partagé entre toutes les instances Vercel.
 *
 * Source principale : la fonction SQL `rate_limit_hit` (migration
 * supabase/migrations/20260924_rate_limits.sql), incrément atomique dans
 * Supabase. Si elle est indisponible (migration pas encore appliquée, base en
 * panne), on retombe sur un compteur EN MÉMOIRE par instance : plus faible
 * (chaque instance compte de son côté) mais jamais « aucune limite ». Le repli
 * est journalisé une fois par instance pour ne pas inonder les logs.
 *
 * On ne bloque jamais une requête à cause d'une panne du limiteur lui-même :
 * le repli mémoire décide toujours.
 */

/** @type {Map<string, { count: number; windowStart: number }>} */
const memCounters = new Map();
let fallbackLogged = false;

/**
 * IP du client. Sur Vercel, `x-real-ip` et le 1er élément de `x-forwarded-for`
 * sont posés par la plateforme (un client ne peut pas les usurper).
 * @param {Request} request
 */
export function getClientIp(request) {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || "unknown";
}

/**
 * @param {string} key
 * @param {number} limit
 * @param {number} windowMs
 */
function memHit(key, limit, windowMs) {
  const now = Date.now();
  const entry = memCounters.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    memCounters.set(key, { count: 1, windowStart: now });
    if (memCounters.size > 10_000) {
      for (const [k, v] of memCounters) {
        if (now - v.windowStart >= windowMs) memCounters.delete(k);
      }
    }
    return { allowed: 1 <= limit, remaining: Math.max(0, limit - 1), resetAt: now + windowMs };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetAt: entry.windowStart + windowMs,
  };
}

/**
 * Compte une requête pour `key` et dit si elle passe.
 * @param {{ key: string; limit: number; windowMs: number }} opts
 * @returns {Promise<{ allowed: boolean; remaining: number; resetAt: number }>}
 */
export async function hitRateLimit({ key, limit, windowMs }) {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
      p_max: limit,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== "boolean") throw new Error("réponse inattendue");
    return {
      allowed: row.allowed,
      remaining: Number(row.remaining) || 0,
      resetAt: Date.parse(row.reset_at) || Date.now() + windowMs,
    };
  } catch (err) {
    if (!fallbackLogged) {
      fallbackLogged = true;
      console.error(
        "[rateLimit] rate_limit_hit indisponible, repli sur un compteur en mémoire par instance:",
        err?.message ?? err
      );
    }
    return memHit(key, limit, windowMs);
  }
}

/**
 * Raccourci pour les routes : applique une limite par IP et renvoie une
 * réponse 429 prête à retourner, ou `null` si la requête passe.
 * @param {Request} request
 * @param {{ name: string; limit: number; windowMs: number; subject?: string }} opts
 *   `subject` remplace l'IP (ex. un user_id) quand la limite vise un compte.
 */
export async function rateLimitOr429(request, { name, limit, windowMs, subject }) {
  const who = subject ?? `ip:${getClientIp(request)}`;
  const res = await hitRateLimit({ key: `${name}:${who}`, limit, windowMs });
  if (res.allowed) return null;
  const retryAfter = Math.max(1, Math.ceil((res.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    {
      ok: false,
      error: `Trop de requêtes. Réessaie dans ${Math.ceil(retryAfter / 60)} min.`,
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

/**
 * Un recalcul forcé (`?refresh=1`) reconstruit tout un cache à coups d'appels
 * eBay / DeepSeek. Les opérateurs (cron, admin) passent toujours ; pour le
 * public, au plus UN recalcul par `scope` et par fenêtre, TOUS visiteurs
 * confondus. Les autres reçoivent simplement le cache, comme sans refresh.
 * @param {{ scope: string; windowMs: number; isOperator: boolean }} opts
 */
export async function allowPublicForceRefresh({ scope, windowMs, isOperator }) {
  if (isOperator) return true;
  const res = await hitRateLimit({ key: `refresh:${scope}`, limit: 1, windowMs });
  return res.allowed;
}
