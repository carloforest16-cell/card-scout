import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { getScoreDeltas } from "@/lib/playerScores";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h in-memory

let memCache = { data: null, fetchedAt: 0 };

function isFresh() {
  return memCache.data && Date.now() - memCache.fetchedAt < CACHE_TTL_MS;
}

/**
 * Attache un delta 7j (tâche 3.3 du plan) à chaque joueur des 4 sections.
 * Calculé à CHAQUE requête (jamais mis dans memCache) sinon le delta figerait
 * jusqu'à 1h — un seul appel batché pour tous les joueurs affichés, pas un
 * par carte.
 * @param {{ enFeu: object[]; breakout: object[]; valeurCachee: object[]; enBaisse: object[]; updatedAt: string }} sections
 */
async function withScoreDeltas(sections) {
  const allIds = [
    ...sections.enFeu,
    ...sections.breakout,
    ...sections.valeurCachee,
    ...sections.enBaisse,
  ].map((p) => p.playerId);
  const deltas = await getScoreDeltas(allIds).catch(() => ({}));
  const attach = (p) => {
    const d = deltas[String(p.playerId)];
    return d
      ? { ...p, scoreDelta: { delta: d.delta, direction: d.direction, hasHistory: d.hasHistory } }
      : p;
  };
  return {
    ...sections,
    enFeu: sections.enFeu.map(attach),
    breakout: sections.breakout.map(attach),
    valeurCachee: sections.valeurCachee.map(attach),
    enBaisse: sections.enBaisse.map(attach),
  };
}

export async function GET() {
  if (isFresh()) {
    return NextResponse.json(await withScoreDeltas(memCache.data));
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: rows, error } = await supabase
      .from("player_scores")
      .select("player_id, player_name, team, score, tier, headshot_url, data")
      .not("score", "is", null)
      .order("score", { ascending: false })
      .limit(200);

    if (error) throw error;

    const players = (rows ?? []).map((r) => {
      const factors = r.data?.factors ?? {};
      return {
        playerId: r.player_id,
        playerName: r.player_name,
        team: r.team,
        score: Number(r.score),
        tier: r.tier,
        headshotUrl: r.headshot_url,
        verdict: r.data?.verdict ?? null,
        reasoning: r.data?.reasoning ?? null,
        momentum: Number(factors.momentum?.score ?? 0),
        hype: Number(factors.hype?.score ?? 0),
        upside: Number(factors.upside?.score ?? 0),
        performance: Number(factors.performance?.score ?? 0),
        age: Number(factors.age?.score ?? 0),
      };
    });

    // Section 1 — En feu : momentum ≥ 8
    const enFeu = players
      .filter((p) => p.momentum >= 8)
      .sort((a, b) => b.momentum - a.momentum)
      .slice(0, 10);

    // Section 2 — Breakout Alerts : upside ≥ 8 ET hype ≥ 6 (jeunes stars émergentes)
    const breakout = players
      .filter((p) => p.upside >= 8 && p.hype >= 6)
      .sort((a, b) => b.upside + b.hype - (a.upside + a.hype))
      .slice(0, 8);

    // Section 3 — Valeur cachée : score ≥ 6.5 ET hype ≤ 4 (sous le radar)
    const valeurCachee = players
      .filter((p) => p.score >= 6.5 && p.hype <= 4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    // Section 4 — En baisse : momentum ≤ 4
    const enBaisse = players
      .filter((p) => p.momentum <= 4 && p.score >= 4)
      .sort((a, b) => a.momentum - b.momentum)
      .slice(0, 6);

    const result = { enFeu, breakout, valeurCachee, enBaisse, updatedAt: new Date().toISOString() };
    memCache = { data: result, fetchedAt: Date.now() };

    return NextResponse.json(await withScoreDeltas(result));
  } catch (err) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}
