import { getNHLFeed } from "@/lib/nhlFeed";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getNHLFeed();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
