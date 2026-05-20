import { NextResponse } from "next/server";

import { getTopOpportunites } from "@/lib/opportunitesTop";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";

  const result = await getTopOpportunites({ forceRefresh: refresh });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Chargement impossible" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    opportunities: result.opportunities,
    lastUpdated: result.lastUpdated,
    analysisNote: result.analysisNote,
    mocked: Boolean(result.mocked),
    ...(result.candidateCount != null
      ? { candidateCount: result.candidateCount }
      : {}),
    ...(result.stale ? { stale: true, staleError: result.error } : {}),
  });
}
