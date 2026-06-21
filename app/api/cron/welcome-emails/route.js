import { NextResponse } from "next/server";
import { Resend } from "resend";

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { recordCronRun } from "@/lib/cronLog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://cardmetrics.io";

/**
 * HTML de l'email de bienvenue. Sobre, mobile-friendly, met en avant les
 * 3 actions de départ (chercher un joueur, voir les opportunités, suivre).
 */
function welcomeHtml() {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:2rem 1rem;color:#1a1a1a">
      <h1 style="font-size:1.6rem;margin:0 0 0.5rem">Bienvenue sur Card Metrics 🏒</h1>
      <p style="color:#555;line-height:1.6;margin:0 0 1.5rem">
        Tu as maintenant accès à l'intelligence qui connecte la performance NHL en
        temps réel à la valeur des cartes. Voici par où commencer :
      </p>

      <table role="presentation" style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:0.75rem 0;border-bottom:1px solid #eee">
            <strong style="display:block;margin-bottom:0.15rem">1. Cherche un joueur</strong>
            <span style="color:#666;font-size:0.9rem">Son Card Metrics Score, ses sous-scores et les meilleures annonces eBay.</span>
          </td>
        </tr>
        <tr>
          <td style="padding:0.75rem 0;border-bottom:1px solid #eee">
            <strong style="display:block;margin-bottom:0.15rem">2. Regarde le Top 10 opportunités</strong>
            <span style="color:#666;font-size:0.9rem">Les cartes que l'IA juge les plus sous-évaluées en ce moment.</span>
          </td>
        </tr>
        <tr>
          <td style="padding:0.75rem 0">
            <strong style="display:block;margin-bottom:0.15rem">3. Suis tes joueurs + crée des alertes</strong>
            <span style="color:#666;font-size:0.9rem">Reçois un email dès qu'une carte passe sous ton prix cible.</span>
          </td>
        </tr>
      </table>

      <div style="margin:1.75rem 0">
        <a href="${SITE_URL}/opportunites" style="display:inline-block;background:#00A8CC;color:#fff;padding:0.85rem 1.75rem;border-radius:10px;text-decoration:none;font-weight:700">
          Voir les opportunités →
        </a>
      </div>

      <p style="color:#999;font-size:0.8125rem;margin:2rem 0 0;line-height:1.5">
        Tu reçois cet email parce que tu viens de créer un compte sur Card Metrics.
        <a href="${SITE_URL}/parametres" style="color:#00A8CC">Gérer mes préférences</a>.
      </p>
    </div>
  `;
}

/**
 * Cron quotidien : envoie l'email de bienvenue aux nouveaux inscrits qui ne
 * l'ont pas encore reçu. Idempotent via welcome_emails_sent.
 */
export async function GET(request) {
  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY manquant" }, { status: 503 });
  }

  const admin = getSupabaseAdmin();
  const resend = new Resend(apiKey);

  // Déjà accueillis → set d'exclusion.
  const { data: sentRows } = await admin.from("welcome_emails_sent").select("user_id");
  const alreadySent = new Set((sentRows ?? []).map((r) => String(r.user_id)));

  // Nouveaux users (1re page suffit ; les anciens sont déjà tous accueillis au
  // fil des exécutions quotidiennes).
  let users = [];
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    users = data?.users ?? [];
  } catch (e) {
    await recordCronRun("welcome-emails", {
      status: "error",
      durationMs: Date.now() - startedAt,
      detail: { error: e?.message ?? "listUsers failed" },
    });
    return NextResponse.json({ ok: false, error: "listUsers failed" }, { status: 502 });
  }

  const targets = users.filter((u) => u.email && !alreadySent.has(String(u.id)));

  let sent = 0;
  let errors = 0;
  for (const user of targets) {
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM ?? "Card Metrics <onboarding@resend.dev>",
        to: user.email,
        subject: "Bienvenue sur Card Metrics 🏒",
        html: welcomeHtml(),
      });
      await admin
        .from("welcome_emails_sent")
        .upsert({ user_id: user.id, email: user.email }, { onConflict: "user_id" });
      sent++;
    } catch {
      errors++;
    }
  }

  await recordCronRun("welcome-emails", {
    status: "ok",
    rowsAffected: sent,
    durationMs: Date.now() - startedAt,
    detail: { candidates: targets.length, errors },
  });

  return NextResponse.json({ ok: true, sent, errors, candidates: targets.length });
}
