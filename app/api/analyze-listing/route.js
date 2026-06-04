import { NextResponse } from "next/server";

import { analyzeEbayListing } from "@/lib/analyzeListing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Colle une URL d'annonce eBay." },
      { status: 400 }
    );
  }

  const result = await analyzeEbayListing(url);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
