import { NextResponse } from "next/server";

import { resolveEbayBearerToken } from "@/lib/ebayServer";
import { fetchEbayHockeyCardListingsForPlayer } from "@/lib/dealFinder";
import { snapshotPricesForPlayer } from "@/lib/priceHistory";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SNAPSHOT_LIMIT = 30;
const CONCURRENCY = 3;

/**
 * Cron Vercel (hebdomadaire) : capture un snapshot des prix eBay actifs
 * pour les 30 joueurs les plus consultés (tirés de player_scores).
 * Stocke dans card_price_history pour alimenter les mini-charts de tendance.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const token = await resolveEbayBearerToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "eBay token indisponible" }, { status: 503 });
  }

  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  let playerNames = [];
  try {
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("player_scores")
      .select("player_name")
      .order("score", { ascending: false })
      .limit(SNAPSHOT_LIMIT);
    playerNames = (data ?? []).map((r) => r.player_name).filter(Boolean);
  } catch {
    playerNames = [];
  }

  if (playerNames.length === 0) {
    return NextResponse.json({ ok: true, snapshotted: 0, note: "Aucun joueur dans player_scores" });
  }

  let success = 0;
  let errors = 0;

  for (let i = 0; i < playerNames.length; i += CONCURRENCY) {
    const batch = playerNames.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (name) => {
        const ebay = await fetchEbayHockeyCardListingsForPlayer(name, token, marketplaceId);
        if (!ebay.ok || !Array.isArray(ebay.listings) || ebay.listings.length === 0) {
          return;
        }
        await snapshotPricesForPlayer(name, ebay.listings);
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") success++;
      else errors++;
    }
  }

  return NextResponse.json({ ok: true, snapshotted: success, errors });
}
