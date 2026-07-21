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
  // null = l'utilisateur n'a jamais réglé ses filtres Hottest Deals ; le client
  // garde alors ses valeurs par défaut.
  hottest_filters: null,
};

const CARD_TYPES = ["all", "young-guns", "auto", "canvas", "graded-psa", "numbered", "parallel"];
const PLAYER_STAGES = ["all", "rookie", "young", "established", "veteran"];

/**
 * Les filtres arrivent du client : on ne stocke que des valeurs connues et des
 * bornes numériques saines, jamais l'objet brut. Un champ invalide fait tomber
 * l'ensemble (null) plutôt que de persister un état à moitié valide qui
 * donnerait une liste vide inexplicable au prochain chargement.
 * @param {unknown} raw
 */
function sanitizeHottestFilters(raw) {
  if (!raw || typeof raw !== "object") return null;
  const minPrice = Number(raw.minPrice);
  const maxPrice = Number(raw.maxPrice);
  const minScore = Number(raw.minScore);

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) return null;
  if (!Number.isFinite(minScore)) return null;
  if (minPrice < 0 || maxPrice > 1000 || minPrice > maxPrice) return null;
  if (minScore < 0 || minScore > 10) return null;
  if (!CARD_TYPES.includes(raw.cardType)) return null;
  if (!PLAYER_STAGES.includes(raw.playerStage)) return null;
  if (typeof raw.team !== "string" || raw.team.length > 4) return null;

  return {
    minPrice,
    maxPrice,
    minScore,
    cardType: raw.cardType,
    playerStage: raw.playerStage,
    team: raw.team,
  };
}

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
  if ("hottest_filters" in body) {
    sanitized.hottest_filters = sanitizeHottestFilters(body.hottest_filters);
  }

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
