import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

let memCache = { data: null, fetchedAt: 0 };
const CACHE_TTL = 6 * 3600 * 1000;

export async function GET() {
  if (memCache.data && Date.now() - memCache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(memCache.data);
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from("player_scores")
      .select("player_id, player_name, team, score, headshot_url, data")
      .not("score", "is", null)
      .order("score", { ascending: false })
      .limit(200);

    if (error) throw error;

    const players = (rows ?? []).map((r) => ({
      playerId: r.player_id,
      playerName: r.player_name,
      team: r.team,
      score: Number(r.score),
      headshotUrl: r.headshot_url,
      verdict: r.data?.verdict ?? null,
      reasoning: r.data?.reasoning ?? null,
      momentum: Number(r.data?.factors?.momentum?.score ?? 0),
      hype: Number(r.data?.factors?.hype?.score ?? 0),
      upside: Number(r.data?.factors?.upside?.score ?? 0),
      performance: Number(r.data?.factors?.performance?.score ?? 0),
    }));

    // Sleeper Pick — upside >= 8, hype <= 5 (sous le radar)
    const sleeper = players
      .filter((p) => p.upside >= 8 && p.hype <= 5)
      .sort((a, b) => b.upside - a.upside)[0] ?? null;

    // Momentum Pick — momentum maximal
    const momentum = players
      .filter((p) => p !== sleeper)
      .sort((a, b) => b.momentum - a.momentum)[0] ?? null;

    // Value Pick — meilleur ratio score/hype (valeur non reconnue)
    const value = players
      .filter((p) => p !== sleeper && p !== momentum && p.score >= 6)
      .sort((a, b) => (b.score - b.hype * 0.3) - (a.score - a.hype * 0.3))[0] ?? null;

    const weekLabel = getWeekLabel();
    const result = { sleeper, momentum, value, weekLabel, generatedAt: new Date().toISOString() };
    memCache = { data: result, fetchedAt: Date.now() };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}

function getWeekLabel() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return monday.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" });
}
