import { NextResponse } from "next/server";
import { Resend } from "resend";

import { buildHealthReport } from "@/lib/healthReport";
import { recordCronRun } from "@/lib/cronLog";
import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { isCronRequest } from "@/lib/requestAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALERT_STATE_CACHE_KEY = "health-check-alert-state-v1";

/**
 * Empreinte des problèmes : un NOUVEAU problème doit déclencher un courriel
 * même si le verdict (warn/error) ne change pas.
 */
function problemSignature(report) {
  const crons = [...report.crons, ...report.caches.map((c) => ({ ...c, cron: `cache:${c.cache}` }))]
    .filter((r) => r.stale || r.status === "error" || r.missing)
    .map((r) => r.cron);
  const pipes = (report.pipelines ?? []).filter((p) => p.warn).map((p) => `pipeline:${p.pipeline}`);
  return `${report.verdict}|${[...crons, ...pipes].sort().join(",")}`;
}

function buildAlertHtml(report) {
  const rows = [...report.crons, ...report.caches.map((c) => ({ ...c, cron: `cache:${c.cache}` }))];
  const problems = rows.filter((r) => r.stale || r.status === "error" || r.missing);
  const items = problems
    .map((r) => `<li>${r.cron} — ${r.status ?? (r.missing ? "cache manquant" : "périmé")} (${r.ageHours ?? "?"}h)</li>`)
    .concat((report.pipelines ?? []).filter((p) => p.warn).map((p) => `<li>${p.pipeline} — ${p.detail}</li>`))
    .join("");
  return `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem 1rem;color:#1a1a1a">
      <h1 style="font-size:1.3rem;margin:0 0 1rem">Card Metrics — Santé du système : ${report.verdict.toUpperCase()}</h1>
      <p style="color:#555;line-height:1.5">Le health-check quotidien a détecté un état "${report.verdict}". Détail :</p>
      <ul style="color:#333;line-height:1.6">${items}</ul>
      <p style="color:#999;font-size:0.8125rem;margin-top:2rem">Généré automatiquement par /api/cron/health-check.</p>
    </div>
  `;
}

/**
 * Cron Vercel (quotidien) : réutilise /api/health (via buildHealthReport) et
 * envoie un email récapitulatif si l'état est warn/error. Anti-spam : ne
 * renvoie pas si l'état est identique à la dernière alerte envoyée.
 */
export async function GET(request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
    const report = await buildHealthReport();
    if (!report.ok) {
      await recordCronRun("health-check", {
        status: "error",
        durationMs: Date.now() - start,
        detail: { error: report.error },
      });
      return NextResponse.json(report, { status: 502 });
    }

    let emailSent = false;
    const adminEmail = process.env.ADMIN_ALERT_EMAIL?.trim();

    if (report.verdict !== "ok" && adminEmail && process.env.RESEND_API_KEY) {
      const lastState = await readJsonCache(ALERT_STATE_CACHE_KEY).catch(() => null);
      const sameAsLast = lastState?.signature === problemSignature(report);

      if (!sameAsLast) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.RESEND_FROM ?? "Card Metrics <onboarding@resend.dev>",
          to: adminEmail,
          subject: `[Card Metrics] Santé système : ${report.verdict.toUpperCase()}`,
          html: buildAlertHtml(report),
        });
        emailSent = true;
      }
    }

    await writeJsonCache(ALERT_STATE_CACHE_KEY, {
      verdict: report.verdict,
      signature: problemSignature(report),
      checkedAt: Date.now(),
    });

    await recordCronRun("health-check", {
      status: report.verdict === "error" ? "error" : "ok",
      durationMs: Date.now() - start,
      detail: { verdict: report.verdict, emailSent },
    });

    return NextResponse.json({ ok: true, verdict: report.verdict, emailSent });
  } catch (err) {
    await recordCronRun("health-check", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
