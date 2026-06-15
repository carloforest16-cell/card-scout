import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Email invalide" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const token = randomBytes(16).toString("hex");

  // Récupère row existante pour préserver le token si présent
  const { data: existing } = await supabase
    .from("newsletter_subscribers")
    .select("unsubscribe_token")
    .eq("email", email)
    .maybeSingle();

  const finalToken = existing?.unsubscribe_token ?? token;

  const { error } = await supabase.from("newsletter_subscribers").upsert(
    {
      email,
      confirmed: true,
      unsubscribed_at: null,
      daily_digest: true,
      unsubscribe_token: finalToken,
    },
    { onConflict: "email" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
