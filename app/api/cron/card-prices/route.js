import { NextResponse } from "next/server";

import { resolveEbayBearerToken } from "@/lib/ebayServer";
import { fetchEbayHockeyCardListingsForPlayer } from "@/lib/dealFinder";
import { snapshotPricesForPlayer } from "@/lib/priceHistory";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { recordCronRun } from "@/lib/cronLog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Panel suivi = les 75 meilleurs scores ∪ les 225 joueurs les plus productifs
// (points). Avant, SEULS les 75 meilleurs scores étaient suivis : le backtest
// ne voyait que des scores 6–7.3 et ne pouvait donc jamais vérifier que « bien
// noté bat mal noté ». Le tri par points donne un panel STABLE (les mêmes
// joueurs d'un snapshot à l'autre, indispensable pour comparer une carte à
// elle-même) qui couvre tout l'éventail de scores (~3.4 à 8.3) avec des
// joueurs qui ont un vrai marché de cartes. ~35 s pour 75 joueurs → ~150 s
// pour ~270, sous le maxDuration de 300 s.
const TOP_BY_SCORE = 75;
const TOP_BY_POINTS = 225;
const CONCURRENCY = 3;

/**
 * Cron Vercel (dimanche + mercredi) : capture un snapshot des prix eBay actifs
 * pour le panel de joueurs ci-dessus. Stocke dans card_price_history pour les
 * mini-charts de tendance et le backtest du score (lib/backtest.js).
 */
export async function GET(request) {
  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const token = await resolveEbayBearerToken();
  if (!token) {
    await recordCronRun("card-prices", {
      status: "error",
      durationMs: Date.now() - startedAt,
      detail: { error: "eBay token indisponible" },
    });
    return NextResponse.json({ ok: false, error: "eBay token indisponible" }, { status: 503 });
  }

  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  try {

  let playerNames = [];
  try {
    const db = getSupabaseAdmin();
    const [byScore, byPoints] = await Promise.all([
      db
        .from("player_scores")
        .select("player_name")
        .order("score", { ascending: false })
        .order("points", { ascending: false })
        .order("player_id", { ascending: true })
        .limit(TOP_BY_SCORE),
      db
        .from("player_scores")
        .select("player_name")
        .order("points", { ascending: false })
        .order("player_id", { ascending: true })
        .limit(TOP_BY_POINTS),
    ]);
    if (byScore.error || byPoints.error) {
      throw new Error((byScore.error ?? byPoints.error).message);
    }
    playerNames = [
      ...new Set([...(byScore.data ?? []), ...(byPoints.data ?? [])].map((r) => r.player_name).filter(Boolean)),
    ];
  } catch (err) {
    console.error("[cron/card-prices] lecture du panel échouée:", err?.message ?? err);
    playerNames = [];
  }

  if (playerNames.length === 0) {
    return NextResponse.json({ ok: true, snapshotted: 0, note: "Aucun joueur dans player_scores" });
  }

  let success = 0;
  let errors = 0;
  let rowsWritten = 0;
  let playersWithListings = 0;

  for (let i = 0; i < playerNames.length; i += CONCURRENCY) {
    const batch = playerNames.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (name) => {
        const ebay = await fetchEbayHockeyCardListingsForPlayer(name, token, marketplaceId);
        if (!ebay.ok || !Array.isArray(ebay.listings) || ebay.listings.length === 0) {
          return { rows: 0, hadListings: false };
        }
        const res = await snapshotPricesForPlayer(name, ebay.listings);
        return { rows: res?.rows ?? 0, hadListings: true };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") {
        success++;
        rowsWritten += r.value?.rows ?? 0;
        if (r.value?.hadListings) playersWithListings++;
      } else {
        errors++;
      }
    }
  }

  // Total cumulé dans la table — pour repérer un zéro silencieux d'un coup d'œil
  let totalRows = null;
  try {
    const db = getSupabaseAdmin();
    const { count } = await db
      .from("card_price_history")
      .select("*", { count: "exact", head: true });
    totalRows = count ?? null;
  } catch {
    /* non bloquant */
  }

  console.log(
    `[cron/card-prices] players=${playerNames.length} withListings=${playersWithListings} rowsWritten=${rowsWritten} errors=${errors} totalRows=${totalRows}`
  );

  await recordCronRun("card-prices", {
    status: errors > 0 && rowsWritten === 0 ? "error" : "ok",
    rowsAffected: rowsWritten,
    durationMs: Date.now() - startedAt,
    detail: { players: playerNames.length, playersWithListings, errors, totalRows },
  });

  return NextResponse.json({
    ok: true,
    players: playerNames.length,
    playersWithListings,
    rowsWritten,
    errors,
    totalRows,
  });
  } catch (err) {
    await recordCronRun("card-prices", {
      status: "error",
      durationMs: Date.now() - startedAt,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
