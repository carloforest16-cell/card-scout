import { NextResponse } from "next/server";

import { getTopOpportunites } from "@/lib/opportunitesTop";
import { recordCronRun } from "@/lib/cronLog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron Vercel : rafraîchit le cache opportunités (Blob + mémoire).
 * Authorization: Bearer ${CRON_SECRET}
 *
 * Ce cron n'enregistrait aucune trace dans cron_runs (ni succès ni échec) —
 * c'est le cron exact dont le fallback silencieux a servi un cache périmé
 * en prod pendant 2 semaines en juin sans que personne ne le remarque.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
    const result = await getTopOpportunites({ forceRefresh: true });

    if (!result.ok) {
      await recordCronRun("opportunites", {
        status: "error",
        durationMs: Date.now() - start,
        detail: { error: result.error ?? "Refresh failed" },
      });
      return NextResponse.json(
        { ok: false, error: result.error ?? "Refresh failed" },
        { status: 500 }
      );
    }

    await recordCronRun("opportunites", {
      status: result.stale ? "error" : "ok",
      durationMs: Date.now() - start,
      detail: result.stale
        ? { stale: true, error: result.error ?? null }
        : null,
    });

    return NextResponse.json({ ok: true, mocked: result.mocked ?? false, candidateCount: result.candidateCount ?? null });
  } catch (err) {
    await recordCronRun("opportunites", {
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
