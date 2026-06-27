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
  { path: "/backtest", priority: 0.6, changeFrequency: "weekly" },
  { path: "/a-propos", priority: 0.5, changeFrequency: "monthly" },
];

/**
 * Sitemap dynamique : pages statiques + une page par joueur scoré
 * (long-tail SEO — chaque fiche joueur est indexable).
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
    const { data } = await db
      .from("player_scores")
      .select("player_id, computed_at")
      .order("score", { ascending: false })
      .limit(500);
    playerEntries = (data ?? [])
      .filter((row) => row.player_id != null)
      .map((row) => ({
        url: `${SITE_URL}/player/${row.player_id}`,
        lastModified: row.computed_at ? new Date(row.computed_at) : now,
        changeFrequency: "weekly",
        priority: 0.7,
      }));
  } catch {
    // DB indisponible → on sert au moins les pages statiques.
  }

  return [...staticEntries, ...playerEntries];
}
