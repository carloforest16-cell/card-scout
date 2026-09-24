import { NextResponse } from "next/server";

import { recordCronRun } from "@/lib/cronLog";
import { SUGGESTED_DEAL_PLAYERS } from "@/lib/dealSuggestions";
import { CARD_MODE_RAW, getDealFinderResult } from "@/lib/dealFinder";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 3;
const TIME_BUDGET_MS = 250_000;

/**
 * Cron Vercel quotidien : précalcule les recherches Deal Finder les plus
 * probables (raccourcis de /deals + Top 10 opportunités, d'où l'on clique
 * vers /deals). Le cache persistant garde un résultat 24 h (servi tout de
 * suite, rafraîchi en arrière-plan) : ces joueurs sont donc toujours
 * instantanés, au lieu de ~9 s pour le premier visiteur de la journée.
 * Coût : ~16 recherches/jour (quelques appels eBay et DeepSeek chacune).
 */
export async function GET(request) {
  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let topNames = [];
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("cache_opportunites")
      .select("payload")
      .eq("key", "top-10")
      .maybeSingle();
    if (error) throw new Error(error.message);
    topNames = (data?.payload?.opportunities ?? []).map((o) => o.playerName).filter(Boolean);
  } catch (err) {
    console.error("[cron/warm-deals] lecture du Top 10 échouée — raccourcis seulement:", err?.message ?? err);
  }

  const seen = new Set();
  const players = [...SUGGESTED_DEAL_PLAYERS, ...topNames].filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const done = [];
  const failed = [];
  let next = 0;
  async function worker() {
    while (next < players.length && Date.now() - startedAt < TIME_BUDGET_MS) {
      const name = players[next++];
      const res = await getDealFinderResult(name, CARD_MODE_RAW, { forceRefresh: true }).catch((err) => ({
        ok: false,
        error: err?.message ?? String(err),
      }));
      (res.ok ? done : failed).push(res.ok ? name : `${name}: ${res.error}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const skipped = players.length - done.length - failed.length;
  const detail = { players: players.length, warmed: done.length, failed, skipped };
  if (failed.length) console.error("[cron/warm-deals] échecs:", failed.join(" | "));
  await recordCronRun("warm-deals", {
    // Plus de la moitié en échec = panne réelle (eBay, DeepSeek…), pas du bruit.
    status: failed.length > players.length / 2 ? "error" : "ok",
    rowsAffected: done.length,
    durationMs: Date.now() - startedAt,
    detail,
  });
  return NextResponse.json({ ok: true, ...detail });
}
