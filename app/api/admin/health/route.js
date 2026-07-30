import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { getCompGuardStats } from "@/lib/soldPrices";

export const dynamic = "force-dynamic";

/**
 * Cadence attendue par cron (en heures). Au-delà de ce seuil sans exécution
 * réussie → flag "stale".
 */
const EXPECTED_INTERVAL_HOURS = {
  "card-prices": 24 * 4, // 2x/sem → tolérance 4 jours
  "snapshot-scores": 36, // quotidien
  "enrich-scores": 36, // quotidien
};

/**
 * GET /api/admin/health
 * Protégé par Bearer ${CRON_SECRET}. Retourne le dernier run de chaque cron
 * instrumenté + un flag stale/error pour repérer un échec silencieux.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("cron_runs")
    .select("cron_name, ran_at, status, rows_affected, duration_ms, detail")
    .order("ran_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }

  // Dernier run par cron.
  const latest = new Map();
  for (const row of data ?? []) {
    if (!latest.has(row.cron_name)) latest.set(row.cron_name, row);
  }

  const now = Date.now();
  const crons = [...latest.values()].map((row) => {
    const ranAtMs = new Date(row.ran_at).getTime();
    const ageHours = Math.round(((now - ranAtMs) / 3_600_000) * 10) / 10;
    const expected = EXPECTED_INTERVAL_HOURS[row.cron_name];
    const stale = expected != null && ageHours > expected;
    const healthy = row.status === "ok" && !stale;
    return {
      cron: row.cron_name,
      lastRun: row.ran_at,
      ageHours,
      status: row.status,
      rowsAffected: row.rows_affected,
      durationMs: row.duration_ms,
      stale,
      healthy,
      detail: row.detail,
    };
  });

  const allHealthy = crons.length > 0 && crons.every((c) => c.healthy);

  // Taux de rejet du garde-fou de comparables (tâche 3.2). `null` tant qu'aucune
  // cote n'a été calculée depuis le déploiement — jamais un 0 % trompeur.
  // Au-delà de 30 %, le matching DeepSeek ne mérite plus d'être le chemin
  // principal : voir PLAN-DEAL-FINDER.md D5.
  const compGuard = await getCompGuardStats();

  return NextResponse.json({ ok: true, allHealthy, crons, compGuard });
}
