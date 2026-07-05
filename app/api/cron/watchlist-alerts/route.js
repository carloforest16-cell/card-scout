import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import { resolveEbayBearerToken, listingPriceToCad } from "@/lib/ebayServer";
import { recordCronRun } from "@/lib/cronLog";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EBAY_BROWSE_SEARCH = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const RENOTIFY_HOURS = 24;
const VOLUME_SPIKE_THRESHOLD = 1.4;
const BASELINE_MAX_AGE_DAYS = 7;
const BIG_GAME_HOURS = 48;
const BIG_GAME_POINTS = 3;

function makeAffiliateUrl(url) {
  try {
    const u = new URL(url);
    u.searchParams.set("mkevt", "1");
    u.searchParams.set("mkcid", "1");
    u.searchParams.set("mkrid", "706-53473-19255-0");
    u.searchParams.set("campid", "5339155833");
    u.searchParams.set("toolid", "10001");
    return u.toString();
  } catch { return url; }
}

async function fetchEbayListings(playerName, token) {
  const q = `${playerName} hockey card`;
  const url = `${EBAY_BROWSE_SEARCH}?q=${encodeURIComponent(q)}&limit=50&filter=cardCondition%3ANEW_WITH_TAGS%7CUSED&sort=newlyListed`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_CA",
    },
  });
  if (!r.ok) return { ids: [], count: 0, items: [] };
  const data = await r.json().catch(() => null);
  const items = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];
  const ids = items.map((it) => String(it.itemId)).filter(Boolean);
  return { ids, count: items.length, items };
}

async function fetchNHLRecentGame(playerId) {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/player/${playerId}/game-log/now`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const games = Array.isArray(data?.gameLog) ? data.gameLog : [];
    if (!games.length) return null;
    const latest = games[0];
    const gameDate = new Date(latest.gameDate ?? 0);
    const hoursAgo = (Date.now() - gameDate.getTime()) / 3600000;
    if (hoursAgo > BIG_GAME_HOURS) return null;
    return {
      date: latest.gameDate,
      goals: Number(latest.goals ?? 0),
      assists: Number(latest.assists ?? 0),
      points: Number(latest.points ?? 0),
      opponentAbbrev: latest.opponentAbbrev,
    };
  } catch { return null; }
}

function wasNotifiedRecently(lastAt) {
  if (!lastAt) return false;
  return (Date.now() - new Date(lastAt).getTime()) < RENOTIFY_HOURS * 3600000;
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

  // Fetch all watchlist entries with at least one alert enabled
  const { data: entries } = await admin
    .from("watchlist")
    .select("*, watchlist_ebay_state(*)")
    .or("alert_new_listing.eq.true,alert_volume_spike.eq.true,alert_gros_match.eq.true");

  if (!entries?.length) {
    await recordCronRun("watchlist-alerts", { status: "ok", rowsAffected: 0, durationMs: Date.now() - start });
    return NextResponse.json({ ok: true, checked: 0, sent: 0 });
  }

  const token = await resolveEbayBearerToken();
  let sent = 0;

  for (const entry of entries) {
    const { data: userData } = await admin.auth.admin.getUserById(entry.user_id);
    const email = userData?.user?.email;
    if (!email) continue;

    const playerName = entry.player_name;
    const playerId = entry.player_id;
    const state = entry.watchlist_ebay_state?.[0] ?? null;

    // Fetch eBay listings once per player (covers new listing + volume spike)
    let ebayData = null;
    if (entry.alert_new_listing || entry.alert_volume_spike) {
      ebayData = await fetchEbayListings(playerName, token);
    }

    // ── Nouveau listing exact ─────────────────────────────────────────────────
    if (entry.alert_new_listing && ebayData && !wasNotifiedRecently(entry.last_new_listing_at)) {
      const prevIds = new Set(state?.listing_ids_snapshot ?? []);
      const newIds = ebayData.ids.filter((id) => !prevIds.has(id));

      if (newIds.length > 0 && prevIds.size > 0) {
        const newItem = ebayData.items.find((it) => newIds.includes(String(it.itemId)));
        const price = newItem ? listingPriceToCad(newItem?.price?.value, newItem?.price?.currency) : null;
        const itemUrl = newItem?.itemWebUrl ? makeAffiliateUrl(newItem.itemWebUrl) : null;

        await resend.emails.send({
          from: process.env.RESEND_FROM ?? "Card Metrics <onboarding@resend.dev>",
          to: email,
          subject: `Nouveau listing — ${playerName} sur eBay`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem 1rem;color:#1a1a1a">
              <h1 style="font-size:1.4rem;margin:0 0 0.75rem">Nouveau listing détecté</h1>
              <p style="color:#555">Un nouveau listing vient d'apparaître pour <strong>${playerName}</strong> sur eBay CA.</p>
              ${newItem ? `
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin:1.5rem 0">
                <p style="margin:0 0 0.5rem;font-weight:600">${newItem.title}</p>
                ${price ? `<p style="margin:0;font-size:1.4rem;font-weight:700;color:#16a34a">$${price.toFixed(2)} CAD</p>` : ""}
              </div>
              ${itemUrl ? `<a href="${itemUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:0.85rem 1.5rem;border-radius:10px;text-decoration:none;font-weight:600">Voir sur eBay</a>` : ""}
              ` : ""}
              <p style="color:#999;font-size:0.8rem;margin:2rem 0 0">Card Metrics · <a href="https://cardmetrics.io/watchlist" style="color:#3b82f6">Gérer ma watchlist</a></p>
            </div>
          `,
        });

        await admin.from("watchlist").update({ last_new_listing_at: new Date().toISOString() }).eq("id", entry.id);
        sent++;
      }
    }

    // ── Spike de volume ───────────────────────────────────────────────────────
    if (entry.alert_volume_spike && ebayData && !wasNotifiedRecently(entry.last_volume_spike_at)) {
      const baseline = state?.listing_count_baseline ?? 0;
      const baselineAge = state?.snapshot_updated_at
        ? (Date.now() - new Date(state.snapshot_updated_at).getTime()) / 86400000
        : 999;

      if (baseline > 0 && baselineAge <= BASELINE_MAX_AGE_DAYS) {
        const ratio = ebayData.count / baseline;
        if (ratio >= VOLUME_SPIKE_THRESHOLD) {
          await resend.emails.send({
            from: process.env.RESEND_FROM ?? "Card Metrics <onboarding@resend.dev>",
            to: email,
            subject: `Spike d'activité — ${playerName} (+${Math.round((ratio - 1) * 100)}% d'annonces)`,
            html: `
              <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem 1rem;color:#1a1a1a">
                <h1 style="font-size:1.4rem;margin:0 0 0.75rem">Spike d'activité détecté</h1>
                <p style="color:#555">Le nombre d'annonces eBay pour <strong>${playerName}</strong> a augmenté de <strong>+${Math.round((ratio - 1) * 100)}%</strong> (${baseline} → ${ebayData.count} annonces).</p>
                <p style="color:#555">Ça peut indiquer une montée en hype ou un événement récent.</p>
                <a href="https://cardmetrics.io/deals?player=${encodeURIComponent(playerName)}" style="display:inline-block;background:#3b82f6;color:#fff;padding:0.85rem 1.5rem;border-radius:10px;text-decoration:none;font-weight:600">Voir les deals</a>
                <p style="color:#999;font-size:0.8rem;margin:2rem 0 0">Card Metrics · <a href="https://cardmetrics.io/watchlist" style="color:#3b82f6">Gérer ma watchlist</a></p>
              </div>
            `,
          });
          await admin.from("watchlist").update({ last_volume_spike_at: new Date().toISOString() }).eq("id", entry.id);
          sent++;
        }
      }
    }

    // Update eBay state snapshot
    if (ebayData) {
      const needsUpdate = !state || (Date.now() - new Date(state.snapshot_updated_at ?? 0).getTime()) > BASELINE_MAX_AGE_DAYS * 86400000;
      if (needsUpdate || !state) {
        await admin.from("watchlist_ebay_state").upsert({
          watchlist_id: entry.id,
          listing_ids_snapshot: ebayData.ids,
          listing_count_baseline: ebayData.count,
          snapshot_updated_at: new Date().toISOString(),
        }, { onConflict: "watchlist_id" });
      } else {
        // Always update snapshot IDs for new listing detection
        await admin.from("watchlist_ebay_state").update({
          listing_ids_snapshot: ebayData.ids,
        }).eq("watchlist_id", entry.id);
      }
    }

    // ── Gros match ────────────────────────────────────────────────────────────
    if (entry.alert_gros_match && !wasNotifiedRecently(entry.last_gros_match_at)) {
      const game = await fetchNHLRecentGame(playerId);
      if (game && game.points >= BIG_GAME_POINTS) {
        const isHatTrick = game.goals >= 3;
        await resend.emails.send({
          from: process.env.RESEND_FROM ?? "Card Metrics <onboarding@resend.dev>",
          to: email,
          subject: isHatTrick
            ? `Hat trick! ${playerName} (${game.goals}G ${game.assists}A) — cartes en hausse`
            : `Gros match! ${playerName} (${game.goals}G ${game.assists}A) — surveille les prix`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem 1rem;color:#1a1a1a">
              <h1 style="font-size:1.4rem;margin:0 0 0.75rem">${isHatTrick ? "Hat trick" : "Gros match"} — ${playerName}</h1>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin:1rem 0;text-align:center">
                <p style="font-size:2rem;font-weight:800;margin:0">${game.goals}G · ${game.assists}A · ${game.points}PTS</p>
                ${game.opponentAbbrev ? `<p style="color:#555;margin:0.5rem 0 0">vs ${game.opponentAbbrev} · ${game.date}</p>` : ""}
              </div>
              <p style="color:#555">Les gros matchs font souvent monter la demande de cartes. Maintenant c'est le bon moment pour surveiller les listings.</p>
              <a href="https://cardmetrics.io/deals?player=${encodeURIComponent(playerName)}" style="display:inline-block;background:#3b82f6;color:#fff;padding:0.85rem 1.5rem;border-radius:10px;text-decoration:none;font-weight:600">Voir les deals</a>
              <p style="color:#999;font-size:0.8rem;margin:2rem 0 0">Card Metrics · <a href="https://cardmetrics.io/watchlist" style="color:#3b82f6">Gérer ma watchlist</a></p>
            </div>
          `,
        });
        await admin.from("watchlist").update({ last_gros_match_at: new Date().toISOString() }).eq("id", entry.id);
        sent++;
      }
    }
  }

  await recordCronRun("watchlist-alerts", {
    status: "ok",
    rowsAffected: sent,
    durationMs: Date.now() - start,
    detail: { checked: entries.length, sent },
  });

  return NextResponse.json({ ok: true, checked: entries.length, sent });
  } catch (err) {
    await recordCronRun("watchlist-alerts", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
