import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/**
 * Désabonne l'abonné du jeton de TOUS les courriels (digest quotidien + picks
 * hebdo, même table). Lien présent dans chaque courriel envoyé.
 * @param {string | undefined} token
 * @returns {Promise<boolean>} true si un abonné correspond au jeton
 */
async function unsubscribeByToken(token) {
  if (!token) return false;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .update({ daily_digest: false, unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .select("email");
  if (error) console.error("[digest/unsubscribe] échec:", error.message);
  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * Désabonnement « en un clic » (RFC 8058) : Gmail et Yahoo envoient un POST
 * sur l'URL de l'en-tête List-Unsubscribe, sans page intermédiaire.
 */
export async function POST(request) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  const ok = await unsubscribeByToken(token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "Token manquant" }, { status: 400 });
  }

  if (!(await unsubscribeByToken(token))) {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Désabonnement</title></head>
      <body style="font-family:system-ui,sans-serif;max-width:480px;margin:4rem auto;padding:2rem;background:#05060a;color:#f1f5f9;text-align:center">
        <h1 style="font-size:1.5rem">Lien invalide</h1>
        <p style="color:#94a3b8">Ce lien de désabonnement n'est pas valide. Écris-nous si tu reçois encore nos courriels.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Désabonnement Card Metrics</title></head>
    <body style="font-family:system-ui,sans-serif;max-width:480px;margin:4rem auto;padding:2rem;background:#05060a;color:#f1f5f9;text-align:center">
      <h1 style="font-size:1.5rem;margin-bottom:1rem">Tu es désabonné(e)</h1>
      <p style="color:#94a3b8;line-height:1.6">Tu ne recevras plus les courriels Card Metrics (digest quotidien et picks hebdo).<br>
      Tu peux te réabonner à tout moment depuis <a href="/digest" style="color:#00d4ff">la page digest</a>.</p>
    </body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
