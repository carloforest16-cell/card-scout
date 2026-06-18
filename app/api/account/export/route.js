import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Export RGPD-friendly de toutes les données de l'utilisateur.
 * Retourne un JSON téléchargeable avec portfolio, watchlist, alerts, prefs.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [portfolio, watchlist, alerts, prefs] = await Promise.all([
    supabase.from("portfolio_cards").select("*").eq("user_id", user.id),
    supabase.from("watchlist").select("*").eq("user_id", user.id),
    supabase.from("price_alerts").select("*").eq("user_id", user.id),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
    },
    portfolio: portfolio.data ?? [],
    watchlist: watchlist.data ?? [],
    priceAlerts: alerts.data ?? [],
    preferences: prefs.data?.preferences ?? {},
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="card-scout-export-${user.id.slice(0, 8)}.json"`,
    },
  });
}
