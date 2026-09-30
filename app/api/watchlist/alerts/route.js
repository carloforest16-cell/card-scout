import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["alert_new_listing", "alert_volume_spike", "alert_gros_match"];

export async function PATCH(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { watchlistId, alertType, enabled } = body ?? {};

  if (!watchlistId || !VALID_TYPES.includes(alertType) || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  // Service role : la table watchlist n'a AUCUNE policy RLS UPDATE, donc via
  // le client utilisateur la mise à jour touchait 0 ligne sans erreur — les
  // interrupteurs d'alertes semblaient marcher mais ne sauvegardaient rien.
  // La propriété reste garantie par le filtre user_id (utilisateur vérifié
  // ci-dessus) et la colonne par la liste blanche VALID_TYPES.
  const { data, error } = await getSupabaseAdmin()
    .from("watchlist")
    .update({ [alertType]: enabled })
    .eq("id", watchlistId)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    console.error("[watchlist/alerts] mise à jour échouée:", error.message);
    return NextResponse.json({ error: "Mise à jour impossible" }, { status: 500 });
  }
  if (!data?.length) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
