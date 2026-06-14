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

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { playerId, playerName, team, headshotUrl, cardType, grade, printRun, purchasePriceCad, purchaseDate, notes } = body ?? {};

  if (!playerId || !playerName || !cardType || !purchasePriceCad) {
    return NextResponse.json({ error: "Champs requis manquants (joueur, type, prix)" }, { status: 400 });
  }
  if (isNaN(Number(purchasePriceCad)) || Number(purchasePriceCad) <= 0) {
    return NextResponse.json({ error: "Prix invalide" }, { status: 400 });
  }

  const { data, error } = await supabase.from("portfolio_cards").insert({
    user_id: user.id,
    player_id: String(playerId),
    player_name: String(playerName),
    team: team ?? null,
    headshot_url: headshotUrl ?? null,
    card_type: String(cardType),
    grade: grade ?? "raw",
    print_run: printRun ? Number(printRun) : null,
    purchase_price_cad: Number(purchasePriceCad),
    purchase_date: purchaseDate ?? null,
    notes: notes ?? null,
  }).select().single();

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
