import { NextResponse } from "next/server";

import { analyzePlayerInvestment } from "@/lib/opportunitesAnalysis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  const name = searchParams.get("name")?.trim() ?? "";

  if (!id) {
    return NextResponse.json(
      { error: "Paramètre requis : id" },
      { status: 400 }
    );
  }

  console.log("[opportunites/player] Analyzing playerId:", id);

  const result = await analyzePlayerInvestment(id, name);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.detail ? { detail: result.detail } : {}),
      },
      { status: result.status ?? 500 }
    );
  }

  return NextResponse.json(result.data);
}
