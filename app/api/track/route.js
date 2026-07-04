import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const { path, referrer } = await request.json();
    if (!path || typeof path !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Exclure /admin
    if (path.startsWith("/admin")) {
      return NextResponse.json({ ok: true });
    }

    const ua = request.headers.get("user-agent") ?? null;
    const db = getSupabaseAdmin();
    await db.from("pageviews").insert({ path, referrer: referrer || null, ua });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
