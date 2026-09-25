import { NextResponse } from "next/server";

import { analyzeEbayListing } from "@/lib/analyzeListing";
import { rateLimitOr429 } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  // Chaque analyse = appels eBay + DeepSeek : 15 par IP par 10 min.
  const limited = await rateLimitOr429(request, {
    name: "analyze-listing",
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }

  const url = typeof body?.url === "string" ? body.url.trim().slice(0, 2000) : "";
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Colle une URL d'annonce eBay." },
      { status: 400 }
    );
  }

  const result = await analyzeEbayListing(url);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
