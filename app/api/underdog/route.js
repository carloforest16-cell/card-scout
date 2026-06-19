import { NextResponse } from "next/server";

import { getUnderdogPlayers } from "@/lib/underdogFinder";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // PR 14 : param `sport` accepté (default 'NHL').
  const sport = String(searchParams.get("sport") ?? "NHL").toUpperCase();
  if (sport !== "NHL") {
    return NextResponse.json(
      { error: `Sport '${sport}' pas encore implémenté`, players: [] },
      { status: 400 }
    );
  }
  try {
    const players = await getUnderdogPlayers();
    return NextResponse.json({ sport, players });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Impossible de charger les talents cachés",
        detail: String(err?.message ?? err),
        players: [],
      },
      { status: 500 }
    );
  }
}
