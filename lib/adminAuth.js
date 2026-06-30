import "server-only";
import { createHmac } from "crypto";
import { NextResponse } from "next/server";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 jours

function getSecret() {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("ADMIN_PASSWORD manquant dans les variables d'environnement");
  return secret;
}

/**
 * Génère un token HMAC signé pour la session admin.
 * Format: <timestamp>.<hmac>
 */
export function createAdminToken() {
  const secret = getSecret();
  const timestamp = Date.now().toString();
  const hmac = createHmac("sha256", secret).update(timestamp).digest("hex");
  return `${timestamp}.${hmac}`;
}

/**
 * Vérifie la validité du token.
 * Retourne true si valide et non expiré.
 */
export function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return false;
  try {
    const secret = getSecret();
    const [timestamp, hmac] = token.split(".");
    if (!timestamp || !hmac) return false;

    // Vérifier HMAC
    const expected = createHmac("sha256", secret).update(timestamp).digest("hex");
    if (expected !== hmac) return false;

    // Vérifier expiration (30 jours)
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > MAX_AGE_SECONDS * 1000) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Middleware helper — vérifie le cookie admin_session.
 * Retourne { ok: true } ou redirige / renvoie 401.
 *
 * @param {Request} request
 * @param {"redirect"|"json"} [mode="json"] — "redirect" pour les pages, "json" pour les API
 */
export function checkAdminAuth(request, mode = "json") {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const valid = verifyAdminToken(token);

  if (!valid) {
    if (mode === "redirect") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.json({ ok: false, error: "Non autorisé" }, { status: 401 });
  }

  return null; // null = authentifié, continuer
}

/**
 * Crée la réponse de connexion avec cookie signé.
 */
export function createLoginResponse(redirectUrl = "/admin") {
  const token = createAdminToken();
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}

/**
 * Efface le cookie de session.
 */
export function createLogoutResponse(redirectUrl = "/admin/login") {
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
  });
  return response;
}

export { COOKIE_NAME, MAX_AGE_SECONDS };
