import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Tracking des clics "Voir sur eBay" pour analytics futur.
 * User-id optionnel (fonctionne anonyme aussi).
 */
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const row = {
    user_id: user?.id ?? null,
    listing_id: body.listingId ? String(body.listingId).slice(0, 200) : null,
    player_id: body.playerId ? String(body.playerId).slice(0, 50) : null,
    player_name: body.playerName ? String(body.playerName).slice(0, 200) : null,
    listing_url: body.listingUrl ? String(body.listingUrl).slice(0, 1000) : null,
    price_cad: Number.isFinite(Number(body.priceCad)) ? Number(body.priceCad) : null,
    referrer: body.referrer ? String(body.referrer).slice(0, 500) : null,
  };

  const { error } = await supabase.from("ebay_clicks").insert(row);
  if (error) {
    // On ne bloque pas le user — tracking best-effort
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}
