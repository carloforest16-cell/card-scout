import { NextResponse } from "next/server";

import { resolveEbayBearerToken } from "@/lib/ebayServer";
import {
  fetchEbayHockeyCardListingsForPlayer,
  computeFairValueByFingerprint,
  detectCardGroup,
} from "@/lib/dealFinder";
import { enrichFairMapWith130Point } from "@/lib/soldPrices";
import { getTopStoredScores } from "@/lib/playerScores";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * PHASE 0 (PLAN-OPPORTUNITY-ENGINE.md) — spike de faisabilité.
 * MESURE, ne construit rien : combien de deals VÉRIFIÉS 130point on trouve en
 * scannant un bassin large, et à quel coût/temps. Sert la porte go/adjust.
 *
 * GET /api/debug/opportunity-spike?limit=40&discount=-5
 * Authorization: Bearer ${CRON_SECRET}
 */
const CONCURRENCY = 5;

export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 40));
  const minDiscount = Number(searchParams.get("discount")) || -5;
  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const token = await resolveEbayBearerToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Pas de token eBay" }, { status: 502 });
  }

  const players = await getTopStoredScores(limit);
  const started = Date.now();

  /** Scan focalisé d'un joueur → deals vérifiés 130point (rabais ≥ minDiscount). */
  async function scanPlayer(p) {
    const name = String(p.player_name ?? "").trim();
    const t0 = Date.now();
    const out = {
      name,
      score: Number(p.score) || null,
      has130Cote: false,
      dealsAll: 0,
      dealsYG: 0,
      best: null,
      ms: 0,
    };
    if (!name) return out;
    try {
      const ebay = await fetchEbayHockeyCardListingsForPlayer(name, token, marketplaceId);
      if (!ebay.ok || !ebay.listings.length) {
        out.ms = Date.now() - t0;
        return out;
      }
      let fairMap = computeFairValueByFingerprint(ebay.listings, name);
      fairMap = await enrichFairMapWith130Point(fairMap, name);
      for (const [key, v] of fairMap) {
        const verified =
          v.fairValueSource === "130point" &&
          (v.fairValueScope ?? "exact") !== "broad" &&
          Number(v.fairValueCad) > 0 &&
          Number(v.minPriceCad) > 0;
        if (!verified) continue;
        out.has130Cote = true;
        const delta = Math.round(((v.minPriceCad - v.fairValueCad) / v.fairValueCad) * 100);
        if (delta > minDiscount) continue;
        out.dealsAll += 1;
        const isYG = key.includes("young-guns") || String(v.sampleTitle ?? "").match(/young\s*guns/i);
        if (isYG) out.dealsYG += 1;
        if (!out.best || delta < out.best.delta) {
          out.best = {
            delta,
            cote: v.fairValueCad,
            min: v.minPriceCad,
            comps: v.comps,
            group: detectCardGroup(v.sampleTitle ?? "") ?? "?",
            title: String(v.sampleTitle ?? "").slice(0, 50),
          };
        }
      }
    } catch (err) {
      out.error = String(err?.message ?? err);
    }
    out.ms = Date.now() - t0;
    return out;
  }

  const results = [];
  for (let i = 0; i < players.length; i += CONCURRENCY) {
    const chunk = players.slice(i, i + CONCURRENCY);
    const scanned = await Promise.all(chunk.map(scanPlayer));
    results.push(...scanned);
  }

  const totalMs = Date.now() - started;
  const withCote = results.filter((r) => r.has130Cote).length;
  const withDeal = results.filter((r) => r.dealsAll > 0);
  const totalDeals = results.reduce((s, r) => s + r.dealsAll, 0);
  const totalYG = results.reduce((s, r) => s + r.dealsYG, 0);
  const avgMs = Math.round(totalMs / Math.max(1, players.length));

  return NextResponse.json({
    ok: true,
    scanned: players.length,
    playersWith130Cote: withCote,
    playersWithDeal: withDeal.length,
    dealsVerified: totalDeals,
    dealsYoungGuns: totalYG,
    dealsPerPlayer: Number((totalDeals / Math.max(1, players.length)).toFixed(2)),
    yieldRatio: `1 deal / ${(players.length / Math.max(1, withDeal.length)).toFixed(1)} joueurs`,
    timing: {
      totalSeconds: Number((totalMs / 1000).toFixed(1)),
      avgMsPerPlayer: avgMs,
      projected150PlayersMin: Number(((avgMs * 150) / 1000 / 60).toFixed(1)),
    },
    topDeals: withDeal
      .filter((r) => r.best)
      .sort((a, b) => a.best.delta - b.best.delta)
      .slice(0, 15)
      .map((r) => ({ name: r.name, score: r.score, ...r.best })),
  });
}
