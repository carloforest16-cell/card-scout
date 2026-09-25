import { NextResponse } from "next/server";
import { createAdminToken } from "@/lib/adminAuth";
import { rateLimitOr429 } from "@/lib/rateLimit";
import { safeEqual } from "@/lib/requestAuth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  // Anti force brute : 5 essais par IP par 15 min, partagé entre instances
  // (le délai de 400 ms seul laissait ~9000 essais/heure par connexion).
  const limited = await rateLimitOr429(request, {
    name: "admin-login",
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return limited;

  try {
    const body = await request.json();
    const { password } = body;

    const expected = process.env.ADMIN_PASSWORD?.trim();
    if (!expected) {
      return NextResponse.json({ ok: false, error: "ADMIN_PASSWORD non configuré" }, { status: 500 });
    }

    if (typeof password !== "string" || !safeEqual(password.trim(), expected)) {
      // Délai anti-brute-force
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json({ ok: false, error: "Mot de passe incorrect" }, { status: 401 });
    }

    // Crée la réponse avec cookie signé — on renvoie juste ok:true,
    // le client redirige lui-même pour éviter un redirect 302 sur fetch.
    const token = createAdminToken();
    const response = NextResponse.json({ ok: true });
    response.cookies.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("[admin/auth] connexion échouée:", err?.message ?? err);
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 });
  }
}
