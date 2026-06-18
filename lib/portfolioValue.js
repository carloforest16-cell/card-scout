import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

const CACHE_FRESHNESS_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Calcule la valeur marché actuelle d'un portfolio utilisateur en croisant
 * portfolio_cards × card_price_history (match par player_name + card_type +
 * grade). Si la table d'historique ne contient pas de point récent, on
 * laisse currentValue à null (le client affichera "—" et un état "en
 * cours de constitution").
 *
 * À enrichir plus tard avec un fallback eBay live par carte.
 */
export async function computePortfolioValue(userId) {
  const supabase = getSupabaseAdmin();

  const { data: cards, error: cardsErr } = await supabase
    .from("portfolio_cards")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (cardsErr) throw cardsErr;
  if (!cards || cards.length === 0) {
    return { cards: [], totalCurrent: 0, totalCost: 0, pnl: 0, pnlPct: 0 };
  }

  // Fetch the most recent price snapshot for each (player_name, card_type, grade) combo
  const keys = new Set(
    cards.map((c) =>
      buildKey(c.player_name, c.card_type, c.grade)
    )
  );

  const enriched = await Promise.all(
    cards.map(async (card) => {
      const snap = await fetchLatestSnapshot(
        supabase,
        card.player_name,
        card.card_type,
        card.grade
      );
      const purchase = Number(card.purchase_price_cad) || 0;
      const current = snap?.median_price_cad ? Number(snap.median_price_cad) : null;
      const pnl = current != null ? Number((current - purchase).toFixed(2)) : null;
      const pnlPct = current != null && purchase > 0
        ? Number(((current - purchase) / purchase * 100).toFixed(1))
        : null;
      const isFresh = snap?.snapshot_date
        ? Date.now() - new Date(snap.snapshot_date).getTime() < CACHE_FRESHNESS_MS * 4
        : false;
      return {
        ...card,
        currentValueCad: current,
        pnl,
        pnlPct,
        priceSource: snap ? "card_price_history" : null,
        priceSnapshotDate: snap?.snapshot_date ?? null,
        priceFresh: isFresh,
      };
    })
  );

  const totalCost = enriched.reduce(
    (s, c) => s + (Number(c.purchase_price_cad) || 0),
    0
  );
  const totalCurrent = enriched.reduce(
    (s, c) => s + (c.currentValueCad ?? Number(c.purchase_price_cad) ?? 0),
    0
  );
  const pnl = Number((totalCurrent - totalCost).toFixed(2));
  const pnlPct = totalCost > 0 ? Number((pnl / totalCost * 100).toFixed(1)) : 0;

  const matchedCount = enriched.filter((c) => c.currentValueCad != null).length;

  return {
    cards: enriched,
    totalCurrent: Number(totalCurrent.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    pnl,
    pnlPct,
    matchedCount,
    uniqueKeysCount: keys.size,
  };
}

function buildKey(player, type, grade) {
  return [normalize(player), normalize(type), normalize(grade)].join("|");
}
function normalize(s) {
  return String(s ?? "").trim().toLowerCase();
}

async function fetchLatestSnapshot(supabase, playerName, cardType, grade) {
  if (!playerName) return null;
  const query = supabase
    .from("card_price_history")
    .select("median_price_cad, snapshot_date")
    .ilike("player_name", String(playerName).trim())
    .order("snapshot_date", { ascending: false })
    .limit(1);
  if (cardType) query.ilike("card_type", String(cardType).trim());
  if (grade) query.ilike("grade", String(grade).trim());
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data;
}
