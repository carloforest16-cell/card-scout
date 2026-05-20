import { NextResponse } from "next/server";

import { getUnderdogPlayers } from "@/lib/underdogFinder";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const players = await getUnderdogPlayers();
    return NextResponse.json({ players });
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
