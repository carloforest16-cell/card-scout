import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { COOKIE_NAME, verifyAdminToken } from "@/lib/adminAuth";

/**
 * Autorisations « opérateur » partagées par les routes API.
 *
 * - `safeEqual` compare deux secrets en temps constant. Un `===` s'arrête au
 *   premier caractère différent : la durée de la comparaison révèle alors
 *   combien de caractères sont bons (attaque temporelle). On compare les
 *   empreintes SHA-256 pour que des longueurs différentes ne fuient rien non
 *   plus.
 * - `isCronRequest` : `Authorization: Bearer ${CRON_SECRET}`. Refuse TOUJOURS
 *   si CRON_SECRET est absent — sinon « Bearer undefined » passerait.
 * - `isOperatorRequest` : cron OU session admin — seuls autorisés à forcer
 *   un recalcul coûteux (`?refresh=1`) sans limite.
 */

/**
 * @param {unknown} a
 * @param {unknown} b
 */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/** @param {Request} request */
export function isCronRequest(request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  return safeEqual(auth, `Bearer ${secret}`);
}

/** @param {Request} request */
export function isAdminRequest(request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  try {
    return verifyAdminToken(decodeURIComponent(match[1]));
  } catch {
    return false;
  }
}

/** @param {Request} request */
export function isOperatorRequest(request) {
  return isCronRequest(request) || isAdminRequest(request);
}
