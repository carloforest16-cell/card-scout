import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * Supprime le compte utilisateur et toutes ses données (cascade via FK).
 * Effectue d'abord un signOut puis admin.deleteUser.
 */
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();

  await Promise.all([
    supabase.from("portfolio_cards").delete().eq("user_id", user.id),
    supabase.from("watchlist").delete().eq("user_id", user.id),
    supabase.from("price_alerts").delete().eq("user_id", user.id),
    supabase.from("user_preferences").delete().eq("user_id", user.id),
  ]);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
