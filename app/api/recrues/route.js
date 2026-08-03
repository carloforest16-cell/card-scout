import "server-only";
import { NextResponse } from "next/server";

import { getRookieClass } from "@/lib/rookieClass";

export const dynamic = "force-dynamic";

const VALID_SORTS = new Set(["score", "points", "ppg", "draft", "name"]);

function normalize(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const position = searchParams.get("position")?.trim().toUpperCase() ?? "";
  const sortParam = searchParams.get("sort") ?? "score";
  const sort = VALID_SORTS.has(sortParam) ? sortParam : "score";
  const minGamesRaw = parseInt(searchParams.get("minGames") ?? "0", 10);
  const minGames = Number.isFinite(minGamesRaw) && minGamesRaw > 0 ? minGamesRaw : 0;
  const forceRefresh = searchParams.get("refresh") === "1";

  let data;
  try {
    data = await getRookieClass({ forceRefresh });
  } catch (err) {
    console.error("[api/recrues] getRookieClass failed:", err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: "Classe de recrues indisponible" },
      { status: 503 }
    );
  }

  let rookies = data.rookies;
  if (position) {
    // D regroupe les défenseurs ; F regroupe C / L / R.
    rookies =
      position === "F"
        ? rookies.filter((r) => r.positionCode && r.positionCode !== "D" && r.positionCode !== "G")
        : rookies.filter((r) => r.positionCode === position);
  }
  if (minGames > 0) {
    rookies = rookies.filter((r) => (r.gamesPlayed ?? 0) >= minGames);
  }

  if (sort !== "score") {
    rookies = [...rookies].sort((a, b) => {
      switch (sort) {
        case "points":
          return (b.points ?? -1) - (a.points ?? -1) || a.playerId.localeCompare(b.playerId);
        case "ppg":
          return (b.pointsPerGame ?? -1) - (a.pointsPerGame ?? -1) || a.playerId.localeCompare(b.playerId);
        case "draft":
          // Non repêchés en dernier — un rang absent n'est pas un rang 0.
          return (a.draftOverall ?? 9999) - (b.draftOverall ?? 9999) || a.playerId.localeCompare(b.playerId);
        case "name":
          return normalize(a.fullName).localeCompare(normalize(b.fullName));
        default:
          return 0;
      }
    });
  }

  return NextResponse.json({
    ok: true,
    seasonId: data.seasonId,
    fetchedAt: data.fetchedAt,
    stale: data.stale,
    total: data.total,
    scored: data.scored,
    shown: rookies.length,
    rookies,
  });
}
