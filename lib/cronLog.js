import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

/**
 * Journalise l'exécution d'un cron dans la table cron_runs.
 * Non bloquant : un échec d'écriture du log ne doit jamais faire échouer le cron.
 *
 * @param {string} cronName  ex. "card-prices"
 * @param {{ status?: "ok" | "error"; rowsAffected?: number | null; durationMs?: number | null; detail?: object | null }} [info]
 */
export async function recordCronRun(cronName, info = {}) {
  try {
    const db = getSupabaseAdmin();
    await db.from("cron_runs").insert({
      cron_name: String(cronName),
      status: info.status === "error" ? "error" : "ok",
      rows_affected: Number.isFinite(info.rowsAffected) ? info.rowsAffected : null,
      duration_ms: Number.isFinite(info.durationMs) ? info.durationMs : null,
      detail: info.detail ?? null,
    });
  } catch {
    // Log best-effort — on n'interrompt jamais le cron pour ça.
  }
}
