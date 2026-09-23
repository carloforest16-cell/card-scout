import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // Jeton de désabonnement : même mécanisme que le digest (le lien des picks
  // ne contient jamais l'adresse courriel).
  const { data: existing } = await supabase
    .from("newsletter_subscribers")
    .select("unsubscribe_token")
    .eq("email", email)
    .maybeSingle();
  const { error } = await supabase.from("newsletter_subscribers").upsert(
    {
      email,
      confirmed: true,
      unsubscribed_at: null,
      unsubscribe_token: existing?.unsubscribe_token ?? randomBytes(16).toString("hex"),
    },
    { onConflict: "email" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
