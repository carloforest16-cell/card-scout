import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import { isAuthorizedAlertsRequest } from "@/lib/alertsTrigger";
import { cardTypeFromGroup, describeAlertFilters, listingMatchesAlertFilters } from "@/lib/alertFilters";
import { detectCardGroup, getDealFinderResult, isGradedListing, shouldExcludeTitle } from "@/lib/dealFinder";
import { toAffiliateUrl } from "@/lib/ebayAffiliate";
import { resolveEbayBearerToken, listingPriceToCad } from "@/lib/ebayServer";
import { titleMatchesPlayer } from "@/lib/titleFilters";
import { recordCronRun } from "@/lib/cronLog";
import { senderIdentityHtml } from "@/lib/emailFooter";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EBAY_BROWSE_SEARCH = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const RENOTIFY_HOURS = 24;

const formatCad = (n) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(Number(n));

/** Échappe un texte venu d'eBay (titre de vendeur) avant de l'insérer dans un courriel HTML. */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Type et état d'une annonce pour les filtres d'alerte. Le type est détecté
 * SANS les mentions de gradation : detectCardGroup classe d'abord « Gradée
 * PSA », ce qui ferait perdre le type d'une Young Guns PSA 10.
 * @param {string} title
 */
function listingFacts(title) {
  const withoutGrade = title.replace(/\b(?:PSA|BGS|SGC|CGC|TAG)\b/gi, " ");
  return {
    cardType: cardTypeFromGroup(detectCardGroup(withoutGrade)),
    isGraded: isGradedListing(title),
  };
}

function hasFilters(alert) {
  return Boolean(
    (Array.isArray(alert.card_types) && alert.card_types.length > 0) ||
      (alert.condition && alert.condition !== "any") ||
      alert.keyword
  );
}

/**
 * Carte la moins chère sous le prix max qui respecte les filtres, via une
 * recherche eBay directe. Mêmes exclusions que le Deal Finder : pas de lot /
 * reprint / custom, et la carte doit bien être CE joueur (la recherche eBay
 * est floue — Quinn ≠ Jack Hughes).
 */
async function findCheapestUnderPrice(alert, token) {
  const playerName = alert.player_name;
  const maxPriceCad = Number(alert.max_price_cad);
  // Le mot-clé resserre la recherche eBay elle-même ; avec des filtres, on
  // lit plus d'annonces (même coût : 1 appel) pour en trouver une qui passe.
  const q = [playerName, alert.keyword, "hockey card"].filter(Boolean).join(" ");
  const limit = hasFilters(alert) ? 150 : 50;
  const url = `${EBAY_BROWSE_SEARCH}?q=${encodeURIComponent(q)}&limit=${limit}&sort=price`;
  let r;
  try {
    r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_CA",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error(`[cron/price-alerts] recherche eBay échouée pour ${playerName}:`, err?.message ?? err);
    return null;
  }
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const items = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];

  const excludeMode = alert.condition === "graded" ? "graded" : "raw";
  for (const it of items) {
    const title = String(it?.title ?? "");
    if (!title || shouldExcludeTitle(title, excludeMode) || !titleMatchesPlayer(playerName, title)) continue;
    if (/mystery/i.test(title)) continue;
    const priceCad = listingPriceToCad(it?.price?.value, it?.price?.currency);
    if (priceCad == null || priceCad > maxPriceCad || priceCad < 1) continue;
    if (!listingMatchesAlertFilters({ title, ...listingFacts(title), score: null }, { ...alert, min_score: null })) continue;
    return {
      title: it.title,
      priceCad,
      url: it.itemWebUrl,
      imageUrl: it?.image?.imageUrl ?? null,
      score: null,
    };
  }
  return null;
}

/**
 * Avec un score minimum : on réutilise les annonces DÉJÀ scorées par le Deal
 * Finder (cache 2 h, servi périmé ≤ 24 h avec recalcul en arrière-plan) — pas
 * d'appel DeepSeek par alerte à chaque passage. Les scores de démonstration
 * (sans vraies données) ne déclenchent jamais d'alerte.
 */
async function findCheapestScored(alert) {
  const maxPriceCad = Number(alert.max_price_cad);
  const modes = alert.condition === "raw" || alert.condition === "graded" ? [alert.condition] : ["raw", "graded"];
  let best = null;
  for (const mode of modes) {
    let res;
    try {
      res = await getDealFinderResult(alert.player_name, mode);
    } catch (err) {
      console.error(`[cron/price-alerts] Deal Finder échoué pour ${alert.player_name} (${mode}):`, err?.message ?? err);
      continue;
    }
    if (!res?.ok || res.data?.mocked) continue;
    for (const l of res.data.listings ?? []) {
      if (l.scoreSource === "demo") continue;
      const title = String(l.title ?? "");
      const priceCad = Number(l.price);
      if (!title || !Number.isFinite(priceCad) || priceCad < 1 || priceCad > maxPriceCad) continue;
      const score = Number(l.investmentScore);
      if (!listingMatchesAlertFilters({ title, ...listingFacts(title), score }, alert)) continue;
      if (!best || priceCad < best.priceCad) {
        best = { title, priceCad, url: l.url, imageUrl: l.imageUrl ?? null, score };
      }
    }
  }
  return best;
}

export async function GET(request) {
  // CRON_SECRET (cron Vercel quotidien) ou jeton dédié du workflow GitHub
  // qui relance les alertes toutes les 15 min (lib/alertsTrigger.js).
  if (!(await isAuthorizedAlertsRequest(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
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
      await recordCronRun("price-alerts", { status: "ok", rowsAffected: 0, durationMs: Date.now() - start });
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

      const match =
        alert.min_score != null
          ? await findCheapestScored(alert)
          : await findCheapestUnderPrice(alert, token);
      if (!match) continue;
      const filterSummary = describeAlertFilters(alert);

      const affiliateUrl = toAffiliateUrl(match.url) ?? match.url;

      await resend.emails.send({
        from: process.env.RESEND_FROM ?? "Card Metrics <onboarding@resend.dev>",
        to: email,
        subject: `${alert.player_name} sous ${formatCad(alert.max_price_cad)}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:2rem 1rem;color:#1a1a1a">
            <h1 style="font-size:1.5rem;margin:0 0 1rem">Alerte prix — ${escapeHtml(alert.player_name)}</h1>
            <p style="color:#555;line-height:1.5">Une carte vient de passer sous ton seuil de <strong>${formatCad(alert.max_price_cad)}</strong>.</p>
            ${filterSummary.length ? `<p style="color:#555;font-size:0.875rem;margin:0">Tes filtres : ${escapeHtml(filterSummary.join(" · "))}</p>` : ""}
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin:1.5rem 0">
              ${match.imageUrl ? `<img src="${escapeHtml(match.imageUrl)}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:1rem" />` : ""}
              <p style="margin:0 0 0.5rem;font-weight:600">${escapeHtml(match.title)}</p>
              <p style="margin:0;font-size:1.5rem;font-weight:700;color:#16a34a">${formatCad(match.priceCad)}</p>
              ${match.score != null ? `<p style="margin:0.25rem 0 0;color:#555;font-size:0.875rem">Score de l’annonce : ${escapeHtml(match.score.toFixed(1))}/10</p>` : ""}
            </div>
            <a href="${escapeHtml(affiliateUrl)}"
 style="display:inline-block;background:#3b82f6;color:#fff;padding:0.85rem 1.5rem;border-radius:10px;text-decoration:none;font-weight:600">Voir sur eBay</a>
            <p style="color:#999;font-size:0.8125rem;margin:2rem 0 0">Tu reçois ce courriel parce que tu as créé une alerte sur Card Metrics. <a href="https://cardmetrics.io/alertes" style="color:#3b82f6">Gérer mes alertes</a>.<br>${senderIdentityHtml("#999")}</p>
          </div>
        `,
      });

      await admin
        .from("price_alerts")
        .update({ last_triggered_at: new Date().toISOString() })
        .eq("id", alert.id);

      sent++;
    }

    await recordCronRun("price-alerts", {
      status: "ok",
      rowsAffected: sent,
      durationMs: Date.now() - start,
      detail: { checked: alerts.length, sent },
    });

    return NextResponse.json({ ok: true, checked: alerts.length, sent });
  } catch (err) {
    await recordCronRun("price-alerts", {
      status: "error",
      durationMs: Date.now() - start,
      detail: { error: err?.message ?? String(err) },
    });
    return NextResponse.json({ ok: false, error: err?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
