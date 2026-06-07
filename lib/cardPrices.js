import "server-only";

import { fetchUngradedCadFromUrl } from "@/lib/sportsCardsPro";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

const TABLE = "card_prices";

// Au-delà de cette ancienneté, un prix vendu est considéré périmé (le cron le
// rafraîchit en priorité ; le score retombe sur la médiane eBay si trop vieux).
const STALE_AFTER_MS = 10 * 24 * 60 * 60 * 1000;
// Politesse SCP : délai entre deux requêtes (anti rate-limit).
const SCRAPE_DELAY_MS = 3000;
// Nombre d'URLs rafraîchies par passage du cron quotidien.
const REFRESH_BATCH = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Prix vendu (ungraded CAD) stocké pour un joueur, ou null si absent/sans URL.
 * @param {string} playerId
 * @returns {Promise<{ ungradedCad: number | null; productUrl: string | null; pricedAt: string | null } | null>}
 */
export async function getStoredCardPrice(playerId) {
  const id = String(playerId).trim();
  if (!id) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(TABLE)
      .select("ungraded_cad, product_url, priced_at")
      .eq("player_id", id)
      .maybeSingle();
    if (error || !data) return null;
    return {
      ungradedCad: data.ungraded_cad != null ? Number(data.ungraded_cad) : null,
      productUrl: data.product_url ?? null,
      pricedAt: data.priced_at ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Prix vendu FRAIS uniquement (pour le scoring) — null si périmé/absent.
 * @param {string} playerId
 * @returns {Promise<number | null>}
 */
export async function getFreshSoldValueCad(playerId) {
  const row = await getStoredCardPrice(playerId);
  if (!row || row.ungradedCad == null) return null;
  const t = row.pricedAt ? new Date(row.pricedAt).getTime() : NaN;
  if (!Number.isFinite(t) || Date.now() - t > STALE_AFTER_MS) return null;
  return row.ungradedCad;
}

/**
 * Enregistre/maj l'URL produit SCP d'un joueur (seed manuel curé) et tente un
 * premier prix immédiat. Valide que l'URL renvoie bien un prix.
 * @param {{ playerId: string; playerName?: string; productUrl: string; cardLabel?: string }} entry
 * @returns {Promise<{ ok: boolean; ungradedCad: number | null; error?: string }>}
 */
export async function seedCardPriceUrl({ playerId, playerName, productUrl, cardLabel }) {
  const id = String(playerId ?? "").trim();
  const url = String(productUrl ?? "").trim();
  if (!id || !url) return { ok: false, ungradedCad: null, error: "playerId/url requis" };

  const ungradedCad = await fetchUngradedCadFromUrl(url);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(TABLE).upsert(
    {
      player_id: id,
      player_name: playerName ?? null,
      product_url: url,
      card_label: cardLabel ?? null,
      ungraded_cad: ungradedCad,
      source: "sportscardspro",
      resolved_at: new Date().toISOString(),
      priced_at: ungradedCad != null ? new Date().toISOString() : null,
    },
    { onConflict: "player_id" }
  );
  if (error) return { ok: false, ungradedCad, error: error.message };
  return { ok: ungradedCad != null, ungradedCad };
}

/**
 * Rafraîchit les prix depuis les URLs stockées — les plus périmés d'abord,
 * séquentiellement avec délai (peu agressif). S'arrête si SCP renvoie trop
 * d'échecs d'affilée (probable blocage IP → on ne martèle pas).
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ refreshed: number; attempted: number; aborted: boolean }>}
 */
export async function refreshCardPrices(options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0
    ? options.limit
    : REFRESH_BATCH;

  const supabase = getSupabaseAdmin();
  // Les plus périmés d'abord (NULLS FIRST = jamais price → priorité).
  const { data, error } = await supabase
    .from(TABLE)
    .select("player_id, product_url, priced_at")
    .not("product_url", "is", null)
    .order("priced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error || !Array.isArray(data)) return { refreshed: 0, attempted: 0, aborted: false };

  let refreshed = 0;
  let attempted = 0;
  let consecutiveFails = 0;

  for (const row of data) {
    attempted += 1;
    const ungradedCad = await fetchUngradedCadFromUrl(row.product_url);
    if (ungradedCad == null) {
      consecutiveFails += 1;
      // 5 échecs d'affilée → on suppose un blocage et on arrête poliment.
      if (consecutiveFails >= 5) {
        return { refreshed, attempted, aborted: true };
      }
    } else {
      consecutiveFails = 0;
      await supabase
        .from(TABLE)
        .update({ ungraded_cad: ungradedCad, priced_at: new Date().toISOString() })
        .eq("player_id", row.player_id);
      refreshed += 1;
    }
    await sleep(SCRAPE_DELAY_MS);
  }

  return { refreshed, attempted, aborted: false };
}
