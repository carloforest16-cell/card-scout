import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  currency: "CAD",
  marketplace: "EBAY_CA",
  theme: "auto",
  language: "fr",
  notify_price_alerts: true,
  notify_weekly_digest: true,
  notify_opps: true,
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const merged = { ...DEFAULTS, ...(data?.preferences ?? {}) };
  return NextResponse.json({ preferences: merged });
}

export async function PUT(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const sanitized = {};
  if (body.currency === "CAD" || body.currency === "USD") sanitized.currency = body.currency;
  if (body.marketplace === "EBAY_CA" || body.marketplace === "EBAY_US") sanitized.marketplace = body.marketplace;
  if (["auto", "dark", "light"].includes(body.theme)) sanitized.theme = body.theme;
  if (body.language === "fr") sanitized.language = body.language;
  if (typeof body.notify_price_alerts === "boolean") sanitized.notify_price_alerts = body.notify_price_alerts;
  if (typeof body.notify_weekly_digest === "boolean") sanitized.notify_weekly_digest = body.notify_weekly_digest;
  if (typeof body.notify_opps === "boolean") sanitized.notify_opps = body.notify_opps;

  const { data: existing } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const merged = { ...DEFAULTS, ...(existing?.preferences ?? {}), ...sanitized };

  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, preferences: merged, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, preferences: merged });
}
