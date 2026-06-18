import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

/**
 * Insère une notification in-app pour un user.
 * Utilisé par les crons (price-alerts, watchlist-alerts, weekly-picks, etc.)
 * pour alimenter l'inbox à côté des emails Resend.
 */
export async function pushNotification({ userId, type, title, body, link, metadata }) {
  if (!userId || !type || !title) return { ok: false, error: "missing fields" };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type: String(type),
    title: String(title),
    body: body ? String(body) : null,
    link: link ? String(link) : null,
    metadata: metadata ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
