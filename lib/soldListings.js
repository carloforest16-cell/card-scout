import "server-only";

import { cohortKeyForTitle, shouldExcludeTitle } from "@/lib/dealFinder";
import { listingPriceToCad } from "@/lib/ebayServer";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { titleMatchesPlayer } from "@/lib/titleFilters";

/**
 * Ventes RÉELLES construites nous-mêmes, gratuitement, via l'API officielle
 * eBay Browse — remplace 130point (bloqué par Cloudflare depuis la mi-août
 * 2026, voir CLAUDE.md).
 *
 * Principe (vérifié le 2026-09-22) :
 *   1. collecte : chaque jour, pour le panel de joueurs, on note les enchères
 *      qui finissent dans les ~26 h (table `sold_listings`, statut pending) ;
 *   2. règlement : après la fin, `getItem` renvoie encore le prix FINAL, le
 *      nombre d'offres et `estimatedSoldQuantity` (1 = vendu, 0 = invendu) —
 *      testé sur des enchères finies depuis 3 mois, toujours disponible.
 *
 * Budget : le quota Browse est de 5 000 appels / jour, partagé avec tout le
 * site, et `getItems` (lot de 20) exige un accès eBay élevé (403). Donc :
 * ≤ 6 enchères retenues par joueur, et le règlement lit le quota restant
 * (API analytics) en gardant une réserve pour le trafic du site. Un reliquat
 * non réglé est simplement traité le lendemain (eBay garde les données).
 */

const TABLE = "sold_listings";
const EBAY_SEARCH = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EBAY_ITEM = "https://api.ebay.com/buy/browse/v1/item/";
const EBAY_RATE_LIMIT =
  "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_name=browse";

const COLLECT_WINDOW_HOURS = 26; // cron quotidien + 2 h de chevauchement
const MAX_PER_PLAYER = 6;
const QUOTA_RESERVE = 1500; // appels gardés pour les visiteurs du site
const MAX_SETTLE_PER_RUN = 1500;
const SETTLE_GRACE_MS = 10 * 60 * 1000; // laisse eBay finaliser l'enchère

/**
 * Exécute `fn` sur `items` avec au plus `limit` promesses simultanées.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Appels Browse restants aujourd'hui (null si l'API analytics ne répond pas).
 * @param {string} token
 */
export async function getBrowseCallsRemaining(token) {
  try {
    const res = await fetch(EBAY_RATE_LIMIT, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    for (const api of data?.rateLimits ?? []) {
      for (const resource of api?.resources ?? []) {
        if (resource?.name !== "buy.browse") continue;
        const remaining = Number(resource?.rates?.[0]?.remaining);
        return Number.isFinite(remaining) ? remaining : null;
      }
    }
    return null;
  } catch (err) {
    console.error("[soldListings] lecture du quota eBay échouée:", err?.message ?? err);
    return null;
  }
}

/**
 * Enchères d'un joueur qui finissent dans la fenêtre de collecte.
 * @param {{ player_id: number|string; player_name: string }} player
 * @param {string} token
 * @param {string} marketplaceId
 */
async function fetchEndingAuctions(player, token, marketplaceId) {
  const name = String(player.player_name ?? "").trim();
  if (!name) return [];
  const now = new Date();
  const until = new Date(now.getTime() + COLLECT_WINDOW_HOURS * 3_600_000);

  const url = new URL(EBAY_SEARCH);
  url.searchParams.set("q", `${name} hockey card`);
  url.searchParams.set("limit", "200");
  url.searchParams.set("sort", "endingSoonest");
  url.searchParams.set(
    "filter",
    `buyingOptions:{AUCTION},itemEndDate:[${now.toISOString()}..${until.toISOString()}]`
  );

  let data;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[soldListings] recherche eBay HTTP ${res.status} pour ${name}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    console.error(`[soldListings] recherche eBay échouée pour ${name}:`, err?.message ?? err);
    return [];
  }

  const rows = [];
  for (const item of data?.itemSummaries ?? []) {
    const title = typeof item?.title === "string" ? item.title : "";
    if (!title || !item?.itemId || !item?.itemEndDate) continue;
    if (shouldExcludeTitle(title, "raw")) continue;
    if (!titleMatchesPlayer(name, title)) continue;
    const cohortKey = cohortKeyForTitle(title, name);
    if (!cohortKey) continue;
    const bid = item?.currentBidPrice ?? item?.price;
    rows.push({
      item_id: item.itemId,
      player_id: Number(player.player_id),
      player_name: name.toLowerCase(),
      title: title.slice(0, 300),
      cohort_key: cohortKey,
      end_at: new Date(item.itemEndDate).toISOString(),
      marketplace: marketplaceId,
      status: "pending",
      bid_count: Number(item?.bidCount) || 0,
      last_bid_cad: listingPriceToCad(bid?.value, bid?.currency),
    });
  }

  // Priorité aux enchères qui ont déjà des offres (quasi sûres de se vendre),
  // puis aux plus chères (cartes qui comptent pour la cote).
  rows.sort((a, b) => b.bid_count - a.bid_count || (b.last_bid_cad ?? 0) - (a.last_bid_cad ?? 0));
  return rows.slice(0, MAX_PER_PLAYER);
}

/**
 * Collecte les enchères du panel qui finissent bientôt. 1 appel eBay / joueur.
 * @param {Array<{ player_id: number|string; player_name: string }>} players
 * @param {string} token
 * @param {string} marketplaceId
 * @param {{ deadlineMs?: number }} [options]
 */
export async function collectEndingAuctions(players, token, marketplaceId, options = {}) {
  const deadline = options.deadlineMs ?? Infinity;
  const perPlayer = await mapWithConcurrency(players, 4, (p) =>
    Date.now() > deadline ? Promise.resolve([]) : fetchEndingAuctions(p, token, marketplaceId)
  );

  // Un même item peut remonter pour deux joueurs (carte double) : première
  // attribution conservée.
  const byId = new Map();
  for (const row of perPlayer.flat()) {
    if (!byId.has(row.item_id)) byId.set(row.item_id, row);
  }
  const rows = [...byId.values()];
  if (rows.length === 0) return { collected: 0, searched: players.length };

  const db = getSupabaseAdmin();
  const { error } = await db.from(TABLE).upsert(rows, { onConflict: "item_id", ignoreDuplicates: true });
  if (error) {
    console.error("[soldListings] insertion des enchères échouée:", error.message);
    return { collected: 0, searched: players.length, error: error.message };
  }
  return { collected: rows.length, searched: players.length };
}

/**
 * Lit le résultat final d'une enchère terminée.
 * @param {object} row ligne `sold_listings` pending
 * @param {string} token
 * @returns {Promise<object | null>} ligne mise à jour, ou null si on réessaiera plus tard
 */
async function settleOne(row, token) {
  let res;
  try {
    res = await fetch(EBAY_ITEM + encodeURIComponent(row.item_id), {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": row.marketplace || "EBAY_CA",
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error(`[soldListings] getItem échoué pour ${row.item_id}:`, err?.message ?? err);
    return null;
  }

  const settledAt = new Date().toISOString();
  if (res.status === 404) return { ...row, status: "gone", settled_at: settledAt };
  if (!res.ok) {
    console.error(`[soldListings] getItem HTTP ${res.status} pour ${row.item_id}`);
    return null;
  }

  let item;
  try {
    item = await res.json();
  } catch {
    return null;
  }

  const endMs = Date.parse(item?.itemEndDate ?? "");
  if (Number.isFinite(endMs) && endMs > Date.now()) {
    // Enchère prolongée / relistée : on garde la nouvelle date, réglée plus tard.
    return { ...row, end_at: new Date(endMs).toISOString() };
  }

  const bidCount = Number(item?.bidCount) || 0;
  const soldQty = Number(item?.estimatedAvailabilities?.[0]?.estimatedSoldQuantity) || 0;
  const final = item?.currentBidPrice ?? item?.price;
  const finalCad = listingPriceToCad(final?.value, final?.currency);
  const sold = bidCount > 0 && soldQty > 0 && finalCad != null;

  return {
    ...row,
    status: sold ? "sold" : "unsold",
    bid_count: bidCount,
    final_price: final?.value != null ? Number(final.value) : null,
    final_currency: final?.currency ?? null,
    final_price_cad: sold ? Math.round(finalCad * 100) / 100 : null,
    settled_at: settledAt,
  };
}

/**
 * Règle les enchères terminées (prix final réel). Respecte le quota eBay.
 * @param {string} token
 * @param {{ deadlineMs?: number }} [options]
 */
export async function settleEndedAuctions(token, options = {}) {
  const deadline = options.deadlineMs ?? Infinity;
  const remaining = await getBrowseCallsRemaining(token);
  // Quota inconnu → prudence : petit lot seulement.
  const budget =
    remaining == null ? 200 : Math.max(0, Math.min(MAX_SETTLE_PER_RUN, remaining - QUOTA_RESERVE));
  if (budget === 0) return { settled: 0, sold: 0, budget, remaining };

  const db = getSupabaseAdmin();
  const { data: pending, error } = await db
    .from(TABLE)
    .select("*")
    .eq("status", "pending")
    .lt("end_at", new Date(Date.now() - SETTLE_GRACE_MS).toISOString())
    .order("end_at", { ascending: true })
    .limit(budget);
  if (error) {
    console.error("[soldListings] lecture des enchères à régler échouée:", error.message);
    return { settled: 0, sold: 0, budget, remaining, error: error.message };
  }

  const updates = (
    await mapWithConcurrency(pending ?? [], 6, (row) =>
      Date.now() > deadline ? Promise.resolve(null) : settleOne(row, token)
    )
  ).filter(Boolean);

  if (updates.length > 0) {
    const { error: upErr } = await db.from(TABLE).upsert(updates, { onConflict: "item_id" });
    if (upErr) {
      console.error("[soldListings] mise à jour des enchères réglées échouée:", upErr.message);
      return { settled: 0, sold: 0, budget, remaining, error: upErr.message };
    }
  }

  return {
    settled: updates.filter((u) => u.status !== "pending").length,
    sold: updates.filter((u) => u.status === "sold").length,
    budget,
    remaining,
  };
}
