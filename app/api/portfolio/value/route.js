import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEbayMedianAndCountForPlayer } from "@/lib/dealFinder";

export const dynamic = "force-dynamic";

// In-memory cache: playerName → { medianPriceCad, listingCount, fetchedAt }
const ebayCache = new Map();
const EBAY_TTL = 30 * 60 * 1000; // 30 min

// Grade multipliers by card type key → grade key
const GRADE_MULT = {
  "PSA 10": {
    "Young Guns": 3.5, "Young Guns Canvas": 4.0, "Canvas": 3.5,
    "RPA": 4.5, "Rookie Auto Patch": 4.2, "Auto Patch": 3.2,
    "Auto on-card": 2.8, "Auto sticker": 2.0,
    "Patch": 2.5, "Refractor": 3.0, "Parallel": 2.8,
    "Insert": 2.0, "Rookie base": 2.4, "Rookie autre": 2.5,
    "Tim Hortons": 2.8, "Carte de base": 2.0,
    default: 2.5,
  },
  "BGS 9.5": { default: 2.2 },
  "PSA 9":   { default: 1.4 },
  "BGS 9":   { default: 1.3 },
  "PSA 8":   { default: 1.1 },
  "raw":     { default: 1.0 },
};

function getMultiplier(grade, cardType) {
  const gradeMap = GRADE_MULT[grade] ?? GRADE_MULT["raw"];
  return gradeMap[cardType] ?? gradeMap["default"] ?? 1.0;
}

async function getEbayMedian(playerName) {
  const cached = ebayCache.get(playerName);
  if (cached && Date.now() - cached.fetchedAt < EBAY_TTL) {
    return { medianPriceCad: cached.medianPriceCad, listingCount: cached.listingCount };
  }
  const result = await getEbayMedianAndCountForPlayer(playerName);
  ebayCache.set(playerName, { ...result, fetchedAt: Date.now() });
  return result;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: cards, error } = await supabase
    .from("portfolio_cards")
    .select("id, player_name, card_type, grade, purchase_price_cad")
    .eq("user_id", user.id)
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cards?.length) return NextResponse.json({ values: [] });

  // Deduplicate eBay calls by player name
  const uniquePlayers = [...new Set(cards.map((c) => c.player_name))];
  const medians = {};
  await Promise.all(
    uniquePlayers.map(async (name) => {
      const result = await getEbayMedian(name);
      medians[name] = result;
    })
  );

  const values = cards.map((card) => {
    const { medianPriceCad, listingCount } = medians[card.player_name] ?? {};
    const mult = getMultiplier(card.grade, card.card_type);
    const estimatedValueCad = medianPriceCad ? Math.round(medianPriceCad * mult * 100) / 100 : null;
    const deltaPct = estimatedValueCad
      ? Math.round(((estimatedValueCad - Number(card.purchase_price_cad)) / Number(card.purchase_price_cad)) * 100)
      : null;

    return {
      cardId: card.id,
      playerName: card.player_name,
      cardType: card.card_type,
      grade: card.grade,
      purchasePriceCad: Number(card.purchase_price_cad),
      estimatedValueCad,
      deltaPct,
      listingCount: listingCount ?? null,
      trend: deltaPct === null ? null : deltaPct > 10 ? "up" : deltaPct < -10 ? "down" : "flat",
    };
  });

  return NextResponse.json({ values });
}
