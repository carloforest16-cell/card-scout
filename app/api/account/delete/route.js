import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * Supprime le compte et TOUTES les données personnelles liées (droit à
 * l'effacement, Loi 25 — promis dans /confidentialite).
 *
 * Tout passe par le service role : avant l'audit du 2026-09-23, les suppressions
 * passaient par le client utilisateur, or user_preferences n'a aucune policy
 * DELETE (0 ligne effacée en silence) et notifications, alerts_triggered,
 * welcome_emails_sent, newsletter_subscribers et watchlist_ebay_state étaient
 * oubliées. Si une étape échoue, le compte auth n'est PAS supprimé : l'utilisateur
 * le voit et peut relancer (chaque étape est idempotente).
 */
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdmin();

  const { data: watchRows, error: watchErr } = await admin
    .from("watchlist")
    .select("id")
    .eq("user_id", user.id);
  if (watchErr) return failed("lecture watchlist", watchErr);
  const watchIds = (watchRows ?? []).map((r) => r.id);

  const steps = [
    watchIds.length > 0
      ? admin.from("watchlist_ebay_state").delete().in("watchlist_id", watchIds)
      : null,
    admin.from("portfolio_cards").delete().eq("user_id", user.id),
    admin.from("price_alerts").delete().eq("user_id", user.id),
    admin.from("user_preferences").delete().eq("user_id", user.id),
    admin.from("notifications").delete().eq("user_id", user.id),
    admin.from("alerts_triggered").delete().eq("user_id", user.id),
    admin.from("welcome_emails_sent").delete().eq("user_id", user.id),
    // Les clics restent comptés dans les statistiques, mais anonymisés.
    admin.from("ebay_clicks").update({ user_id: null }).eq("user_id", user.id),
    user.email
      // Égalité exacte (les abonnés sont stockés en minuscules) : avec ilike,
      // « _ » et « % » sont des jokers — a_b@x.com effaçait aussi axb@x.com.
      ? admin.from("newsletter_subscribers").delete().eq("email", user.email.trim().toLowerCase())
      : null,
  ].filter(Boolean);

  const results = await Promise.all(steps);
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) return failed("suppression des données", firstError);

  // La watchlist en dernier : watchlist_ebay_state y fait référence.
  const { error: wlErr } = await admin.from("watchlist").delete().eq("user_id", user.id);
  if (wlErr) return failed("suppression watchlist", wlErr);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return failed("suppression du compte", error);

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}

/**
 * @param {string} step
 * @param {{ message?: string }} error
 */
function failed(step, error) {
  console.error(`[api/account/delete] échec — ${step}:`, error?.message ?? error);
  return NextResponse.json(
    { error: "La suppression n'a pas pu être terminée. Ton compte existe toujours : réessaie dans un instant ou écris-nous." },
    { status: 500 }
  );
}
