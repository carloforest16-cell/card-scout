import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import { resolveEbayBearerToken, listingPriceToCad } from "@/lib/ebayServer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EBAY_BROWSE_SEARCH = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const RENOTIFY_HOURS = 24;

/**
 * Cherche la carte la moins chère pour un joueur sous un prix max.
 */
async function findCheapestUnderPrice(playerName, maxPriceCad, token) {
  const q = `${playerName} hockey card`;
  const url = `${EBAY_BROWSE_SEARCH}?q=${encodeURIComponent(q)}&limit=50&sort=price`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_CA",
    },
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const items = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];

  for (const it of items) {
    const title = String(it?.title ?? "").toLowerCase();
    if (title.includes("reprint") || title.includes("mystery")) continue;
    const priceCad = listingPriceToCad(it?.price?.value, it?.price?.currency);
    if (priceCad == null || priceCad > maxPriceCad || priceCad < 1) continue;
    return {
      title: it.title,
      priceCad,
      url: it.itemWebUrl,
      imageUrl: it?.image?.imageUrl ?? null,
    };
  }
  return null;
}

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data: alerts } = await admin
    .from("price_alerts")
    .select("*")
    .eq("active", true);

  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0 });
  }

  const token = await resolveEbayBearerToken();
  const cutoff = new Date(Date.now() - RENOTIFY_HOURS * 3600 * 1000).toISOString();
  let sent = 0;

  for (const alert of alerts) {
    if (alert.last_triggered_at && alert.last_triggered_at > cutoff) continue;

    const { data: userData } = await admin.auth.admin.getUserById(alert.user_id);
    const email = userData?.user?.email;
    if (!email) continue;

    const match = await findCheapestUnderPrice(
      alert.player_name,
      Number(alert.max_price_cad),
      token
    );
    if (!match) continue;

    const affiliateUrl = (() => {
      try {
        const u = new URL(match.url);
        u.searchParams.set("mkevt", "1");
        u.searchParams.set("mkcid", "1");
        u.searchParams.set("mkrid", "706-53473-19255-0");
        u.searchParams.set("campid", "5339155833");
        u.searchParams.set("toolid", "10001");
        return u.toString();
      } catch { return match.url; }
    })();

    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "Card Scout <onboarding@resend.dev>",
      to: email,
      subject: `${alert.player_name} sous $${alert.max_price_cad} CAD`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem 1rem;color:#1a1a1a">
          <h1 style="font-size:1.5rem;margin:0 0 1rem">Alerte prix — ${alert.player_name}</h1>
          <p style="color:#555;line-height:1.5">Une carte vient de passer sous ton seuil de <strong>$${Number(alert.max_price_cad).toFixed(2)} CAD</strong>.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin:1.5rem 0">
            ${match.imageUrl ? `<img src="${match.imageUrl}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:1rem" />` : ""}
            <p style="margin:0 0 0.5rem;font-weight:600">${match.title}</p>
            <p style="margin:0;font-size:1.5rem;font-weight:700;color:#16a34a">$${match.priceCad.toFixed(2)} CAD</p>
          </div>
          <a href="${affiliateUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:0.85rem 1.5rem;border-radius:10px;text-decoration:none;font-weight:600">Voir sur eBay</a>
          <p style="color:#999;font-size:0.8125rem;margin:2rem 0 0">Tu reçois cet email parce que tu as créé une alerte sur Card Scout. <a href="https://card-scout.vercel.app/alertes" style="color:#3b82f6">Gérer mes alertes</a>.</p>
        </div>
      `,
    });

    await admin
      .from("price_alerts")
      .update({ last_triggered_at: new Date().toISOString() })
      .eq("id", alert.id);

    sent++;
  }

  return NextResponse.json({ ok: true, checked: alerts.length, sent });
}
