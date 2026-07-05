import { NextResponse } from "next/server";

import { syncAllPlayers } from "@/lib/playerDirectory";
import { recordCronRun } from "@/lib/cronLog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron Vercel (hebdomadaire) : synchronise l'annuaire complet des joueurs NHL
 * dans la table `players`. Inclut tous les patineurs de la saison courante.
 * Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
    const result = await syncAllPlayers();

    await recordCronRun("sync-players", {
      status: "ok",
      rowsAffected: result.synced,
      durationMs: Date.now() - start,
      detail: { errors: result.errors },
    });

    return NextResponse.json({ ok: true, synced: result.synced, errors: result.errors });
  } catch (err) {
    console.error("[cron/sync-players]", err?.message ?? err);
    await recordCronRun("sync-players", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Erreur inconnue" },
      { status: 500 }
    );
  }
}
