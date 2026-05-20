import { NextResponse } from "next/server";

import { buildTrendingPayload } from "@/lib/trendingData";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await buildTrendingPayload();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Impossible de charger les tendances",
        detail: String(err?.message ?? err),
        hot: [],
        steals: [],
        stealsUsedPrice: false,
      },
      { status: 500 }
    );
  }
}
