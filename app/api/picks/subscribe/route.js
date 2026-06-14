import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("newsletter_subscribers").upsert(
    { email, confirmed: true, unsubscribed_at: null },
    { onConflict: "email" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email requis" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  await supabase
    .from("newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("email", email);

  return NextResponse.json({ ok: true });
}
