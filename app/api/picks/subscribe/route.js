import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { rateLimitOr429 } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request) {
  // Anti-abus : 5 inscriptions par IP par heure (sinon un script peut inscrire
  // des milliers d'adresses et nous faire envoyer des courriels non sollicités).
  const limited = await rateLimitOr429(request, {
    name: "picks-subscribe",
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
