import { NextResponse } from "next/server";
import { Resend } from "resend";

import { buildAuctionDealsPayload } from "@/lib/auctionDeals";
import { buildHottestDealsPayload } from "@/lib/dealsHottest";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { recordCronRun } from "@/lib/cronLog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://cardmetrics.io").replace(/\/$/, "");

function formatCad(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(x);
}

function hoursUntil(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const h = (t - Date.now()) / 3600000;
  return h > 0 ? Math.round(h * 10) / 10 : null;
}

function buildDigestHtml({ auction, hottest, mover, unsubscribeUrl }) {
  const auctionBlock = auction ? `
    <tr><td style="padding:0 0 16px 0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a;border:1px solid rgba(239,68,68,0.25);border-radius:12px;overflow:hidden">
        <tr><td style="padding:18px 20px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#ef4444;font-family:monospace">ENCHÈRE CHAUDE · ${hoursUntil(auction.endAt) ?? "—"}h restantes</p>
          <p style="margin:0 0 4px;font-size:17px;font-weight:800;color:#f1f5f9">${auction.playerName}</p>
          <p style="margin:0 0 10px;font-size:13px;color:#94a3b8">${auction.cardType ?? ""}</p>
          <p style="margin:0 0 14px;font-size:15px;color:#94a3b8">Bid actuel <strong style="color:#22c55e">${formatCad(auction.priceCad)}</strong> · Cote <strong style="color:#cbd5e1">${formatCad(auction.fairValueCad)}</strong> (<strong style="color:#22c55e">−${auction.dealPct}%</strong>)</p>
          <a href="${SITE_URL}/encheres" style="display:inline-block;background:#ef4444;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Voir l'enchère →</a>
        </td></tr>
      </table>
    </td></tr>` : "";

  const hottestBlock = (hottest && hottest.length > 0) ? hottest.slice(0, 2).map((h, i) => `
    <tr><td style="padding:0 0 12px 0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a;border:1px solid rgba(249,115,22,0.25);border-radius:12px;overflow:hidden">
        <tr><td style="padding:18px 20px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#fb923c;font-family:monospace">HOTTEST DEAL #${i + 1}</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#f1f5f9">${h.playerName}</p>
          <p style="margin:0 0 10px;font-size:13px;color:#94a3b8">${h.groupType ?? ""} · Score ${Number(h.investmentScore).toFixed(1)}/10</p>
          <a href="${SITE_URL}/deals?player=${encodeURIComponent(h.playerName)}" style="display:inline-block;background:#f97316;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700">Voir les deals →</a>
        </td></tr>
      </table>
    </td></tr>`).join("") : "";

  const moverBlock = mover ? `
    <tr><td style="padding:0 0 16px 0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a;border:1px solid rgba(34,197,94,0.25);border-radius:12px;overflow:hidden">
        <tr><td style="padding:18px 20px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#4ade80;font-family:monospace">SCORE RÉÉVALUÉ AUJOURD'HUI</p>
          <p style="margin:0 0 4px;font-size:16px;font-weight:800;color:#f1f5f9">${mover.playerName}</p>
          <p style="margin:0 0 10px;font-size:13px;color:#94a3b8">${mover.team ?? "—"} · Score Card Metrics <strong style="color:#22c55e">${Number(mover.score).toFixed(1)}/10</strong></p>
          <a href="${SITE_URL}/player/${mover.playerId}" style="display:inline-block;background:#22c55e;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700">Voir le joueur →</a>
        </td></tr>
      </table>
    </td></tr>` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#05060a;color:#f1f5f9">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#05060a">
    <tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">
        <tr><td style="padding:0 0 24px;text-align:center">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.1em;color:#94a3b8;font-family:monospace">CARD METRICS · DIGEST QUOTIDIEN</p>
          <h1 style="margin:0;font-size:24px;font-weight:900;color:#f1f5f9;font-family:Arial,sans-serif">Ce qui bouge aujourd'hui</h1>
        </td></tr>
        ${auctionBlock}
        ${hottestBlock}
        ${moverBlock}
        <tr><td style="padding:24px 0 0;text-align:center;border-top:1px solid rgba(255,255,255,0.08)">
          <p style="margin:0;font-size:11px;color:#64748b;line-height:1.6">
            Tu reçois cet email parce que tu t'es abonné au digest quotidien Card Metrics.<br>
            <a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline">Se désabonner</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
  const supabase = getSupabaseAdmin();
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: subscribers, error } = await supabase
    .from("newsletter_subscribers")
    .select("email, unsubscribe_token")
    .eq("daily_digest", true)
    .eq("confirmed", true)
    .is("unsubscribed_at", null);

  if (error) {
    await recordCronRun("daily-digest", { status: "error", durationMs: Date.now() - start, detail: { error: error.message } });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!subscribers || subscribers.length === 0) {
    await recordCronRun("daily-digest", { status: "ok", rowsAffected: 0, durationMs: Date.now() - start, detail: { reason: "no subscribers" } });
    return NextResponse.json({ ok: true, sent: 0, reason: "no subscribers" });
  }

  const [auctionPayload, hottestPayload, moverRes] = await Promise.allSettled([
    buildAuctionDealsPayload(),
    buildHottestDealsPayload({ cardMode: "raw" }),
    (async () => {
      const { data } = await supabase
        .from("player_scores")
        .select("player_id, player_name, team, score, tier")
        .gte("score", 7)
        .order("computed_at", { ascending: false })
        .limit(1);
      const r = Array.isArray(data) && data[0] ? data[0] : null;
      return r ? { playerId: r.player_id, playerName: r.player_name, team: r.team, score: r.score, tier: r.tier } : null;
    })(),
  ]);

  const auction = auctionPayload.status === "fulfilled"
    ? (auctionPayload.value?.auctions ?? [])[0] ?? null : null;
  const hottest = hottestPayload.status === "fulfilled"
    ? hottestPayload.value?.cards ?? [] : [];
  const mover = moverRes.status === "fulfilled" ? moverRes.value : null;

  if (!auction && hottest.length === 0 && !mover) {
    await recordCronRun("daily-digest", { status: "ok", rowsAffected: 0, durationMs: Date.now() - start, detail: { reason: "no content" } });
    return NextResponse.json({ ok: true, sent: 0, reason: "no content" });
  }

  const from = process.env.RESEND_FROM ?? "Card Metrics <onboarding@resend.dev>";
  let sent = 0;
  for (const sub of subscribers) {
    try {
      const unsubscribeUrl = sub.unsubscribe_token
        ? `${SITE_URL}/api/digest/unsubscribe?token=${sub.unsubscribe_token}`
        : `${SITE_URL}/digest`;
      const html = buildDigestHtml({ auction, hottest, mover, unsubscribeUrl });
      await resend.emails.send({
        from,
        to: sub.email,
        subject: "Ce qui bouge aujourd'hui — Card Metrics",
        html,
      });
      sent++;
    } catch {
      // best effort
    }
  }

  await recordCronRun("daily-digest", {
    status: "ok",
    rowsAffected: sent,
    durationMs: Date.now() - start,
    detail: { total: subscribers.length, sent },
  });

  return NextResponse.json({ ok: true, sent, total: subscribers.length });
  } catch (err) {
    await recordCronRun("daily-digest", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
