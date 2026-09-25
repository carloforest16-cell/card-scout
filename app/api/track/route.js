import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { rateLimitOr429 } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request) {
  // Anti-remplissage de la table pageviews : 120 vues par IP par 10 min.
  const limited = await rateLimitOr429(request, {
    name: "track",
    limit: 120,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  try {
    const { path, referrer } = await request.json();
    if (!path || typeof path !== "string" || !path.startsWith("/") || path.length > 300) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Exclure /admin
    if (path.startsWith("/admin")) {
      return NextResponse.json({ ok: true });
    }

    const ua = request.headers.get("user-agent") ?? null;
    const db = getSupabaseAdmin();
    await db.from("pageviews").insert({
      path,
      referrer: typeof referrer === "string" && referrer ? referrer.slice(0, 500) : null,
      ua: ua ? ua.slice(0, 400) : null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
