import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { readJsonCache } from "@/lib/persistentCache";

/**
 * Autorisation des crons d'alertes (price-alerts, watchlist-alerts).
 *
 * Vercel Hobby ne lance un cron qu'une fois par jour ; un workflow GitHub
 * Actions (.github/workflows/alerts.yml, gratuit : dépôt public) les appelle
 * toutes les 15 minutes. Il utilise un jeton DÉDIÉ plutôt que CRON_SECRET :
 * il ne peut déclencher que ces deux routes. Seule l'empreinte SHA-256 du
 * jeton est stockée (cache_generic, RLS service role) ; le jeton lui-même vit
 * uniquement dans le secret GitHub ALERTS_TRIGGER_TOKEN.
 */
export const ALERTS_TOKEN_CACHE_KEY = "alerts-trigger-token-v1";

/** @param {string} value */
export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * @param {Request} request
 * @returns {Promise<boolean>}
 */
export async function isAuthorizedAlertsRequest(request) {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token.length < 32) return false;

  try {
    const stored = await readJsonCache(ALERTS_TOKEN_CACHE_KEY);
    const expected = typeof stored?.sha256 === "string" ? stored.sha256 : null;
    if (!expected) return false;
    const a = Buffer.from(sha256Hex(token), "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch (err) {
    console.error("[alertsTrigger] lecture de l'empreinte échouée:", err?.message ?? err);
    return false;
  }
}
