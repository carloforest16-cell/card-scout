import { NextResponse } from "next/server";

import { normalizeAlertFilters } from "@/lib/alertFilters";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401 });

  const { data, error } = await supabase
    .from("price_alerts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

/** Chaque alerte active coûte des appels eBay toutes les 15 min (quota partagé). */
const MAX_ACTIVE_ALERTS_PER_USER = 20;

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const maxPrice = Number(body?.maxPriceCad);
  const playerId = String(body?.playerId ?? "").trim().slice(0, 20);
  const playerName = String(body?.playerName ?? "").trim().slice(0, 100);
  if (!playerId || !playerName || !Number.isFinite(maxPrice) || maxPrice <= 0 || maxPrice > 1_000_000) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const { count } = await supabase
    .from("price_alerts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("active", true);
  if ((count ?? 0) >= MAX_ACTIVE_ALERTS_PER_USER) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ACTIVE_ALERTS_PER_USER} alertes actives. Désactive-en une d'abord.` },
      { status: 409 }
    );
  }

  const filters = normalizeAlertFilters(body);
  const row = {
    user_id: user.id,
    player_id: playerId,
    player_name: playerName,
    max_price_cad: maxPrice,
  };
  // Colonnes de filtre envoyées seulement si utilisées : une alerte sans
  // filtre reste insérable même avant la migration 20260930_price_alert_filters.
  if (filters.card_types) row.card_types = filters.card_types;
  if (filters.condition !== "any") row.condition = filters.condition;
  if (filters.min_score != null) row.min_score = filters.min_score;
  if (filters.keyword) row.keyword = filters.keyword;

  const { error } = await supabase.from("price_alerts").insert(row);
  if (error) {
    console.error("[api/alerts] création échouée:", error.message);
    return NextResponse.json({ error: "Création de l'alerte impossible" }, { status: 500 });
  }

  // Surveiller le prix d'un joueur, c'est le suivre : on l'ajoute à la
  // watchlist s'il n'y est pas, SANS activer ses alertes (aucun courriel de
  // plus que ce que l'utilisateur a demandé). Déjà suivi → rien ne change.
  await addToWatchlistSilently(supabase, user.id, playerId, playerName);

  return NextResponse.json({ ok: true });
}

/**
 * @param {Awaited<ReturnType<typeof createClient>>} supabase client utilisateur (RLS : ses lignes seulement)
 */
async function addToWatchlistSilently(supabase, userId, playerId, playerName) {
  try {
    const { data: existing } = await supabase
      .from("watchlist")
      .select("id")
      .eq("user_id", userId)
      .eq("player_id", playerId)
      .maybeSingle();
    if (existing) return;

    const { data: p } = await supabase
      .from("players")
      .select("team_abbrev, position_code, headshot_url")
      .eq("player_id", playerId)
      .maybeSingle();

    const { error } = await supabase.from("watchlist").insert({
      user_id: userId,
      player_id: playerId,
      player_name: playerName,
      player_team: p?.team_abbrev ?? null,
      player_position: p?.position_code ?? null,
      headshot_url: p?.headshot_url ?? null,
      alert_new_listing: false,
      alert_volume_spike: false,
      alert_gros_match: false,
    });
    if (error && !error.message.includes("duplicate")) {
      console.error("[api/alerts] ajout watchlist échoué:", error.message);
    }
  } catch (err) {
    // L'alerte est créée ; l'ajout à la watchlist est un bonus, jamais bloquant.
    console.error("[api/alerts] ajout watchlist échoué:", err?.message ?? err);
  }
}

export async function PATCH(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const patch = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.maxPriceCad === "number" && body.maxPriceCad > 0) patch.max_price_cad = body.maxPriceCad;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const { error } = await supabase
    .from("price_alerts")
    .update(patch)
    .eq("user_id", user.id)
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { error } = await supabase
    .from("price_alerts")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
