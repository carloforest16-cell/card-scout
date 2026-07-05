import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import { recordCronRun } from "@/lib/cronLog";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function makeAffiliateDealsUrl(playerName) {
  const base = "https://cardmetrics.io/deals";
  return `${base}?player=${encodeURIComponent(playerName)}`;
}

function pickHtml({ sleeper, momentum, value, weekLabel }) {
  function card(pick, type, color, icon) {
    if (!pick) return "";
    return `
      <tr>
        <td style="padding:0 0 16px 0">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
            <tr>
              <td style="padding:20px 24px">
                <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;color:${color}">${icon} ${type}</p>
                <p style="margin:0 0 8px 0;font-size:18px;font-weight:800;color:#0f172a">${pick.playerName}</p>
                <p style="margin:0 0 12px 0;font-size:13px;color:#64748b;font-family:monospace">${pick.team ?? "—"} · Score ${pick.score?.toFixed(1) ?? "—"}/10</p>
                ${pick.reasoning ? `<p style="margin:0 0 16px 0;font-size:14px;color:#475569;line-height:1.6">${pick.reasoning.slice(0, 180)}${pick.reasoning.length > 180 ? "…" : ""}</p>` : ""}
                <a href="${makeAffiliateDealsUrl(pick.playerName)}"
                  style="display:inline-block;background-color:${color};color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">
                  Voir les deals →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#64748b;font-family:monospace">CARD METRICS · PICKS</p>
              <h1 style="margin:0;font-size:28px;font-weight:900;color:#0f172a;font-family:Arial,sans-serif">
                Picks de la semaine
              </h1>
              <p style="margin:8px 0 0;font-size:14px;color:#64748b">Semaine du ${weekLabel}</p>
            </td>
          </tr>

          ${card(momentum, "MOMENTUM PICK", "#f97316", "🔥")}
          ${card(sleeper, "SLEEPER PICK", "#8b5cf6", "⚡")}
          ${card(value, "VALUE PICK", "#10b981", "💎")}

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;border-top:1px solid #e2e8f0">
              <p style="margin:0;font-size:12px;color:#94a3b8">
                Tu reçois cet email parce que tu es abonné aux Picks Card Metrics.<br>
                <a href="https://cardmetrics.io/picks?unsubscribe={{{EMAIL}}}" style="color:#64748b">Se désabonner</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Fetch subscribers
  const { data: subscribers } = await admin
    .from("newsletter_subscribers")
    .select("email")
    .eq("confirmed", true)
    .is("unsubscribed_at", null);

  if (!subscribers?.length) {
    await recordCronRun("weekly-picks", { status: "ok", rowsAffected: 0, durationMs: Date.now() - start, detail: { reason: "no subscribers" } });
    return NextResponse.json({ ok: true, sent: 0, reason: "no subscribers" });
  }

  // Fetch picks from internal API
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://cardmetrics.io").replace(/\/$/, "");
  const picksRes = await fetch(`${baseUrl}/api/picks`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!picksRes.ok) {
    await recordCronRun("weekly-picks", { status: "error", durationMs: Date.now() - start, detail: { error: "picks fetch failed", status: picksRes.status } });
    return NextResponse.json({ error: "picks fetch failed" }, { status: 500 });
  }
  const picks = await picksRes.json();

  const html = pickHtml(picks);
  const text = [
    `Picks Card Metrics — Semaine du ${picks.weekLabel}`,
    "",
    picks.momentum ? `🔥 MOMENTUM: ${picks.momentum.playerName} (${picks.momentum.team}) — Score ${picks.momentum.score?.toFixed(1)}/10` : "",
    picks.sleeper ? `⚡ SLEEPER: ${picks.sleeper.playerName} (${picks.sleeper.team}) — Score ${picks.sleeper.score?.toFixed(1)}/10` : "",
    picks.value ? `💎 VALUE: ${picks.value.playerName} (${picks.value.team}) — Score ${picks.value.score?.toFixed(1)}/10` : "",
    "",
    "Voir tous les deals : https://cardmetrics.io/picks",
  ].filter(Boolean).join("\n");

  let sent = 0;
  for (const { email } of subscribers) {
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM ?? "Card Metrics <onboarding@resend.dev>",
        to: [email],
        subject: `🏒 Picks de la semaine — ${picks.momentum?.playerName ?? "NHL Cards"}`,
        html,
        text,
      });
      sent++;
    } catch { /* best effort */ }
  }

  await recordCronRun("weekly-picks", {
    status: "ok",
    rowsAffected: sent,
    durationMs: Date.now() - start,
    detail: { total: subscribers.length, sent },
  });

  return NextResponse.json({ ok: true, sent, total: subscribers.length });
  } catch (err) {
    await recordCronRun("weekly-picks", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
