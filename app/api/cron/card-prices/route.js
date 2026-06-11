import { NextResponse } from "next/server";

import { refreshCardPrices, seedCardPriceUrl } from "@/lib/cardPrices";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  return secret && auth === `Bearer ${secret}`;
}

/**
 * GET — cron quotidien : rafraîchit les prix vendus depuis les URLs stockées.
 * Query optionnelle ?limit=N.
 */
export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const limitParam = new URL(request.url).searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  try {
    const result = await refreshCardPrices({ limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}

/**
 * POST — seed des URLs SCP curées (one-shot).
 * Body : { entries: [{ playerId, playerName?, productUrl, cardLabel? }, ...] }
 */
export async function POST(request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }
  const entries = Array.isArray(body?.entries) ? body.entries : [];
  if (entries.length === 0) {
    return NextResponse.json({ ok: false, error: "entries requis" }, { status: 400 });
  }

  const results = [];
  for (const e of entries) {
    const r = await seedCardPriceUrl({
      playerId: String(e.playerId ?? "").trim(),
      playerName: e.playerName,
      productUrl: e.productUrl,
      cardLabel: e.cardLabel,
      ungradedCadOverride: e.ungradedCad,
    });
    results.push({ playerId: e.playerId, playerName: e.playerName, ...r });
  }

  return NextResponse.json({
    ok: true,
    seeded: results.filter((r) => r.ok).length,
    total: results.length,
    results,
  });
}
