import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("portfolio_cards")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data ?? [] });
}

/**
 * Calcule le coût d'acquisition à stocker en purchase_price_cad selon le
 * mode : prix direct, ou carte pullée d'une box (coût réparti sur le nombre
 * de cartes de valeur gardées de cette box).
 * @returns {{ ok: true, purchasePriceCad: number, boxCostCad: number|null, boxCardsCount: number|null } | { ok: false, error: string }}
 */
function resolveAcquisitionCost({ acquisitionType, purchasePriceCad, boxCostCad, boxCardsCount }) {
  if (acquisitionType === "pack_pull") {
    const cost = Number(boxCostCad);
    const count = Number(boxCardsCount) || 1;
    if (isNaN(cost) || cost <= 0) {
      return { ok: false, error: "Coût de la box invalide" };
    }
    if (!Number.isInteger(count) || count < 1) {
      return { ok: false, error: "Nombre de cartes gardées invalide" };
    }
    return { ok: true, purchasePriceCad: Math.round((cost / count) * 100) / 100, boxCostCad: cost, boxCardsCount: count };
  }
  const price = Number(purchasePriceCad);
  if (isNaN(price) || price <= 0) {
    return { ok: false, error: "Prix invalide" };
  }
  return { ok: true, purchasePriceCad: price, boxCostCad: null, boxCardsCount: null };
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const {
    playerId, playerName, team, headshotUrl, cardType, grade, printRun,
    acquisitionType, purchasePriceCad, boxCostCad, boxCardsCount,
    purchaseDate, notes,
  } = body ?? {};

  if (!playerId || !playerName || !cardType) {
    return NextResponse.json({ error: "Champs requis manquants (joueur, type)" }, { status: 400 });
  }

  const resolved = resolveAcquisitionCost({ acquisitionType, purchasePriceCad, boxCostCad, boxCardsCount });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });

  const { data, error } = await supabase.from("portfolio_cards").insert({
    user_id: user.id,
    player_id: String(playerId),
    player_name: String(playerName),
    team: team ?? null,
    headshot_url: headshotUrl ?? null,
    card_type: String(cardType),
    grade: grade ?? "raw",
    print_run: printRun ? Number(printRun) : null,
    acquisition_type: acquisitionType === "pack_pull" ? "pack_pull" : "purchase",
    purchase_price_cad: resolved.purchasePriceCad,
    box_cost_cad: resolved.boxCostCad,
    box_cards_count: resolved.boxCardsCount,
    purchase_date: purchaseDate ?? null,
    notes: notes ?? null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, card: data });
}

export async function PATCH(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const {
    id, cardType, grade, printRun,
    acquisitionType, purchasePriceCad, boxCostCad, boxCardsCount,
    purchaseDate, notes,
  } = body ?? {};

  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const resolved = resolveAcquisitionCost({ acquisitionType, purchasePriceCad, boxCostCad, boxCardsCount });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });

  const { data, error } = await supabase
    .from("portfolio_cards")
    .update({
      card_type: cardType ? String(cardType) : undefined,
      grade: grade ?? undefined,
      print_run: printRun ? Number(printRun) : null,
      acquisition_type: acquisitionType === "pack_pull" ? "pack_pull" : "purchase",
      purchase_price_cad: resolved.purchasePriceCad,
      box_cost_cad: resolved.boxCostCad,
      box_cards_count: resolved.boxCardsCount,
      purchase_date: purchaseDate ?? null,
      notes: notes ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, card: data });
}

export async function DELETE(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  // RLS garantit ownership, mais on double-vérifie
  const { error } = await supabase
    .from("portfolio_cards")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
