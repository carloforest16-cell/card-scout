import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;

let _cache = null;
let _cacheAt = 0;

function normalize(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

async function fetchAllPlayers() {
  const db = getSupabaseAdmin();
  const [playersRes, scoresRes] = await Promise.all([
    db
      .from("players")
      .select(
        "player_id, full_name, team_abbrev, position_code, birth_date, age, games_played, goals, assists, points, headshot_url, is_active"
      )
      .eq("sport", "NHL")
      .eq("is_active", true)
      .range(0, 1999),
    // L'annuaire affiche TOUS les scores, y compris math-only (score de base
    // stats seules) — c'est un chiffre + tier honnête, sans verdict DeepSeek.
    // Seul le top opportunités exclut les math (il exige le narratif complet).
    db
      .from("player_scores")
      .select("player_id, score, tier, data")
      .range(0, 1999),
  ]);

  if (playersRes.error) {
    console.error("[joueurs] fetch players failed:", playersRes.error.message);
  }
  if (scoresRes.error) {
    console.error("[joueurs] fetch scores failed:", scoresRes.error.message);
  }

  const scoreMap = new Map(
    (scoresRes.data ?? []).map((s) => [s.player_id, s])
  );

  return (playersRes.data ?? []).map((p) => {
    const s = scoreMap.get(p.player_id);
    return {
      player_id: p.player_id,
      full_name: p.full_name,
      team_abbrev: p.team_abbrev,
      position_code: p.position_code,
      age: p.age,
      games_played: p.games_played,
      goals: p.goals,
      assists: p.assists,
      points: p.points,
      headshot_url: p.headshot_url,
      score: s ? Number(s.score) : null,
      tier: s?.tier ?? null,
      scoreMode: s?.data?.scoreMode ?? null,
      hasScore: s != null,
    };
  });
}

async function getPlayerList() {
  if (_cache && Date.now() - _cacheAt < CACHE_TTL_MS) return _cache;
  _cache = await fetchAllPlayers();
  _cacheAt = Date.now();
  return _cache;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const team = searchParams.get("team")?.trim().toUpperCase() ?? "";
  const position = searchParams.get("position")?.trim().toUpperCase() ?? "";
  const sort = searchParams.get("sort") ?? "score";
  const order = searchParams.get("order") ?? "desc";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );

  let all;
  try {
    all = await getPlayerList();
  } catch (err) {
    console.error("[joueurs] getPlayerList failed:", err?.message ?? err);
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 });
  }

  let filtered = all;

  if (search) {
    const q = normalize(search);
    filtered = filtered.filter((p) => normalize(p.full_name).includes(q));
  }
  if (team) {
    filtered = filtered.filter((p) => p.team_abbrev === team);
  }
  if (position) {
    filtered = filtered.filter((p) => p.position_code === position);
  }

  filtered = [...filtered].sort((a, b) => {
    let diff = 0;
    switch (sort) {
      case "name":
        diff = normalize(a.full_name).localeCompare(normalize(b.full_name));
        break;
      case "age":
        diff = (a.age ?? 999) - (b.age ?? 999);
        break;
      case "points":
        diff = (b.points ?? -1) - (a.points ?? -1);
        break;
      case "score":
      default:
        if (a.hasScore && !b.hasScore) return -1;
        if (!a.hasScore && b.hasScore) return 1;
        diff = (b.score ?? -1) - (a.score ?? -1);
        if (diff === 0) diff = (b.points ?? -1) - (a.points ?? -1);
        if (diff === 0) diff = a.player_id.localeCompare(b.player_id);
    }
    if (order === "asc") diff = -diff;
    return diff;
  });

  const total = filtered.length;
  const pages = Math.ceil(total / limit) || 1;
  const start = (page - 1) * limit;
  const players = filtered.slice(start, start + limit);

  return NextResponse.json({ ok: true, players, total, page, pages });
}
