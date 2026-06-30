import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * Vérifie le token admin côté Edge Runtime.
 * Même logique que lib/adminAuth.js — dupliqué pour éviter crypto Node.js dans Edge.
 */
async function verifyAdminTokenEdge(token) {
  if (!token || typeof token !== "string") return false;
  try {
    const secret = process.env.ADMIN_PASSWORD;
    if (!secret) return false;

    const dotIdx = token.indexOf(".");
    if (dotIdx === -1) return false;
    const timestamp = token.slice(0, dotIdx);
    const hmac = token.slice(dotIdx + 1);
    if (!timestamp || !hmac) return false;

    // Vérifier expiration (30 jours)
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > 30 * 24 * 60 * 60 * 1000) return false;

    // HMAC via Web Crypto API (disponible dans Edge Runtime)
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp));
    const expected = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return expected === hmac;
  } catch {
    return false;
  }
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // ─── Protection admin ───────────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // La page de login est publique
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }

    const token = request.cookies.get("admin_session")?.value;
    const valid = await verifyAdminTokenEdge(token);
    if (!valid) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // ─── Supabase session refresh (pages publiques) ──────────────────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)",
  ],
};
