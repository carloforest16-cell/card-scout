import { NextResponse } from "next/server";

import { recordCronRun } from "@/lib/cronLog";
import { resolveEbayBearerToken } from "@/lib/ebayServer";
import { getPricePanelPlayers } from "@/lib/priceHistory";
import { collectEndingAuctions, settleEndedAuctions } from "@/lib/soldListings";
import { isCronRequest } from "@/lib/requestAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Marge sous maxDuration pour écrire les résultats et le log du cron.
const TIME_BUDGET_MS = 240_000;

/**
 * Cron Vercel quotidien : ventes réelles gratuites (voir lib/soldListings.js).
 *   1. règle les enchères terminées depuis la veille (prix final eBay) ;
 *   2. note les enchères du panel qui finissent dans les ~26 h.
 * Le règlement passe en premier : c'est lui qui consomme le quota restant.
 */
export async function GET(request) {
  const startedAt = Date.now();
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const token = await resolveEbayBearerToken();
  if (!token) {
    await recordCronRun("sold-listings", {
      status: "error",
      durationMs: Date.now() - startedAt,
      detail: { error: "eBay token indisponible" },
    });
    return NextResponse.json({ ok: false, error: "eBay token indisponible" }, { status: 503 });
  }

  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";
  const deadlineMs = startedAt + TIME_BUDGET_MS;

  try {
    const settle = await settleEndedAuctions(token, { deadlineMs });

    let collect = { collected: 0, searched: 0, skipped: "temps écoulé" };
    if (Date.now() < deadlineMs) {
      const players = await getPricePanelPlayers();
      collect = await collectEndingAuctions(players, token, marketplaceId, { deadlineMs });
    }

    const failed = Boolean(settle.error || collect.error);
    const detail = { settle, collect };
    console.log(`[cron/sold-listings] ${JSON.stringify(detail)}`);
    await recordCronRun("sold-listings", {
      status: failed ? "error" : "ok",
      rowsAffected: (settle.sold ?? 0) + (collect.collected ?? 0),
      durationMs: Date.now() - startedAt,
      detail,
    });
    return NextResponse.json({ ok: !failed, ...detail }, { status: failed ? 500 : 200 });
  } catch (err) {
    console.error("[cron/sold-listings] échec:", err?.message ?? err);
    await recordCronRun("sold-listings", {
      status: "error",
      durationMs: Date.now() - startedAt,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
