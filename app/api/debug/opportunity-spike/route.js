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

  // Types de carte qui S'APPRÉCIENT (hiérarchie d'investissement) — le reste
  // (base, parallèles communs, autres) n'est pas un actif d'investissement.
  const APPRECIATING = /Young Guns|Auto|RPA|Gradée|Numéroté|The Cup|SPx|Premier|Canvas|Clear Cut/i;

  /**
   * Scan focalisé d'un joueur → CANDIDATS-INVESTISSEMENT : carte qui s'apprécie +
   * cote active fiable (≥4 comps) + une annonce au prix du marché ou en dessous
   * (≤110 %). Rapide : cotes d'annonces actives, pas de 130point (réservé au
   * signal de confiance bonus plus tard).
   */
  async function scanPlayer(p) {
    const name = String(p.player_name ?? "").trim();
    const t0 = Date.now();
    const out = { name, score: Number(p.score) || null, candidates: 0, best: null, ms: 0 };
    if (!name) return out;
    try {
      const ebay = await fetchEbayHockeyCardListingsForPlayer(name, token, marketplaceId);
      if (!ebay.ok || !ebay.listings.length) {
        out.ms = Date.now() - t0;
        return out;
      }
      const fairMap = computeFairValueByFingerprint(ebay.listings, name);
      for (const [, v] of fairMap) {
        const group = detectCardGroup(v.sampleTitle ?? "") ?? "";
        const appreciating = APPRECIATING.test(group);
        const hasCote = Number(v.fairValueCad) > 0 && Number(v.comps) >= 4;
        if (!appreciating || !hasCote || !(Number(v.minPriceCad) > 0)) continue;
        const pct = Math.round((v.minPriceCad / v.fairValueCad) * 100);
        if (pct > 110) continue; // on ne surpaie pas
        out.candidates += 1;
        if (!out.best || pct < out.best.pct) {
          out.best = {
            pct,
            cote: v.fairValueCad,
            min: v.minPriceCad,
            comps: v.comps,
            group,
            title: String(v.sampleTitle ?? "").slice(0, 46),
          };
        }
      }
    } catch (err) {
      out.error = String(err?.message ?? err);
    }
    out.ms = Date.now() - t0;
    return out;
  }
  void enrichFairMapWith130Point;
  void minDiscount;

  const results = [];
  for (let i = 0; i < players.length; i += CONCURRENCY) {
    const chunk = players.slice(i, i + CONCURRENCY);
    const scanned = await Promise.all(chunk.map(scanPlayer));
    results.push(...scanned);
  }

  const totalMs = Date.now() - started;
  const withCandidate = results.filter((r) => r.candidates > 0);
  const totalCandidates = results.reduce((s, r) => s + r.candidates, 0);
  const avgMs = Math.round(totalMs / Math.max(1, players.length));

  return NextResponse.json({
    ok: true,
    scanned: players.length,
    playersWithCandidate: withCandidate.length,
    investmentCandidates: totalCandidates,
    candidatesPerPlayer: Number((totalCandidates / Math.max(1, players.length)).toFixed(2)),
    coverage: `${Math.round((withCandidate.length / Math.max(1, players.length)) * 100)}% des joueurs ont ≥1 candidat`,
    timing: {
      totalSeconds: Number((totalMs / 1000).toFixed(1)),
      avgMsPerPlayer: avgMs,
      projected150PlayersMin: Number(((avgMs * 150) / 1000 / 60).toFixed(1)),
    },
    sample: withCandidate
      .filter((r) => r.best)
      .sort((a, b) => a.best.pct - b.best.pct)
      .slice(0, 15)
      .map((r) => ({ name: r.name, score: r.score, ...r.best })),
  });
}
