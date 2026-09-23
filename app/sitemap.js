import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const revalidate = 86400; // 24h

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://cardmetrics.io";

/** Pages statiques publiques, avec priorité SEO. */
const STATIC_ROUTES = [
  { path: "", priority: 1.0, changeFrequency: "daily" },
  { path: "/deals", priority: 0.9, changeFrequency: "daily" },
  { path: "/opportunites", priority: 0.9, changeFrequency: "weekly" },
  { path: "/encheres", priority: 0.7, changeFrequency: "daily" },
  { path: "/joueurs", priority: 0.8, changeFrequency: "weekly" },
  { path: "/recrues", priority: 0.8, changeFrequency: "weekly" },
  { path: "/pulse", priority: 0.7, changeFrequency: "daily" },
  { path: "/picks", priority: 0.7, changeFrequency: "weekly" },
  { path: "/analyse", priority: 0.6, changeFrequency: "monthly" },
  { path: "/digest", priority: 0.5, changeFrequency: "monthly" },
  { path: "/a-propos", priority: 0.5, changeFrequency: "monthly" },
  { path: "/confidentialite", priority: 0.2, changeFrequency: "yearly" },
  { path: "/conditions", priority: 0.2, changeFrequency: "yearly" },
  // /backtest volontairement absent : page noindex tant que le résultat
  // n'est pas publié (voir app/backtest/page.js).
];

/**
 * Sitemap dynamique : pages statiques + une fiche par joueur de l'effectif
 * NHL actif (long-tail SEO). Avant : les 500 meilleurs scores de
 * player_scores — légendes retraitées incluses, ~440 joueurs actifs oubliés.
 */
export default async function sitemap() {
  const now = new Date();

  const staticEntries = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  let playerEntries = [];
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("players")
      .select("player_id, synced_at")
      .eq("is_active", true)
      .order("points", { ascending: false, nullsFirst: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    playerEntries = (data ?? [])
      .filter((row) => row.player_id != null)
      .map((row) => ({
        url: `${SITE_URL}/player/${row.player_id}`,
        lastModified: row.synced_at ? new Date(row.synced_at) : now,
        changeFrequency: "weekly",
        priority: 0.7,
      }));
  } catch (err) {
    // DB indisponible → on sert au moins les pages statiques.
    console.error("[sitemap] fiches joueurs indisponibles:", err?.message ?? err);
  }

  return [...staticEntries, ...playerEntries];
}
