import { NextResponse } from "next/server";
import { createLoginResponse } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const { password } = body;

    const expected = process.env.ADMIN_PASSWORD?.trim();
    if (!expected) {
      return NextResponse.json({ ok: false, error: "ADMIN_PASSWORD non configuré" }, { status: 500 });
    }

    if (!password || password.trim() !== expected) {
      // Délai anti-brute-force
      await new Promise((r) => setTimeout(r, 400));
      return NextResponse.json({ ok: false, error: "Mot de passe incorrect" }, { status: 401 });
    }

    // Crée la réponse avec cookie signé — on renvoie juste ok:true,
    // le client redirige lui-même pour éviter un redirect 302 sur fetch.
    const token = (await import("@/lib/adminAuth")).createAdminToken();
    const response = NextResponse.json({ ok: true });
    response.cookies.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 });
  }
}
