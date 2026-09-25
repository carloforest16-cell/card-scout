import { NextResponse } from "next/server";

import { getDeepseekApiKey } from "@/lib/deepseekKey";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, hitRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const MAX_HISTORY_TURNS = 10;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_MESSAGE_LEN = 800;

/** Plafond global toutes conversations confondues (compte ou IP), par heure. */
const RATE_LIMIT_GLOBAL_MAX = 40;

/**
 * Deux compteurs partagés entre instances (lib/rateLimit.js) : par joueur
 * (10/h, l'expérience voulue) ET global par compte/IP (40/h). L'ancien
 * compteur `${userId}|${playerId}` vivait en mémoire d'une seule instance et
 * se remettait à zéro en changeant de joueur — aucun plafond réel sur les
 * coûts DeepSeek.
 */
async function checkRateLimit(who, playerId) {
  const [perPlayer, global] = await Promise.all([
    hitRateLimit({ key: `score-chat:${who}:${playerId}`, limit: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS }),
    hitRateLimit({ key: `score-chat:${who}`, limit: RATE_LIMIT_GLOBAL_MAX, windowMs: RATE_LIMIT_WINDOW_MS }),
  ]);
  const blocked = [perPlayer, global].find((r) => !r.allowed);
  if (blocked) {
    return { ok: false, resetIn: Math.max(1, Math.ceil((blocked.resetAt - Date.now()) / 1000)) };
  }
  return { ok: true, remaining: Math.min(perPlayer.remaining, global.remaining) };
}

function formatFactorsBlock(factors) {
  if (!factors || typeof factors !== "object") return "";
  const labels = {
    performance: "Performance",
    momentum: "Momentum",
    momentumDetailed: "Accélération",
    age: "Âge",
    marketValue: "Marché",
    liquidity: "Liquidité",
    upside: "Upside",
    hype: "Hype",
    marketDiscrepancy: "Discrépance Marché",
    risk: "Risque",
    teamContext: "Contexte d'équipe",
    catalysts: "Catalyseurs",
  };
  const lines = [];
  for (const [key, label] of Object.entries(labels)) {
    const raw = factors[key];
    const score = typeof raw === "object" ? raw?.score : raw;
    const n = Number(score);
    if (Number.isFinite(n)) {
      lines.push(`- ${label}: ${n.toFixed(1)}/10`);
    }
  }
  return lines.join("\n");
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }

  const playerId = String(body?.playerId ?? "").trim().slice(0, 20);
  const message = String(body?.message ?? "").trim().slice(0, MAX_MESSAGE_LEN);
  const history = Array.isArray(body?.history) ? body.history : [];

  if (!playerId || !message) {
    return NextResponse.json({ ok: false, error: "playerId et message requis" }, { status: 400 });
  }

  // User identification pour rate limit
  let userId = "anon";
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data?.user?.id) userId = data.user.id;
  } catch {
    // pas grave, on rate-limit par IP-like key sinon
  }

  const who = userId === "anon" ? `ip:${getClientIp(request)}` : `user:${userId}`;
  const limit = await checkRateLimit(who, playerId);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: `Limite atteinte. Reviens dans ${Math.ceil(limit.resetIn / 60)} minutes.` },
      { status: 429 }
    );
  }

  // Charge contexte joueur depuis player_scores
  const db = getSupabaseAdmin();
  const { data: row } = await db
    .from("player_scores")
    .select("player_name, score, tier, data")
    .eq("player_id", playerId)
    .single();

  if (!row) {
    return NextResponse.json({ ok: false, error: "Joueur sans score" }, { status: 404 });
  }

  const playerName = row.player_name ?? "ce joueur";
  const score = Number(row.score);
  const verdict = row.data?.verdict ?? "Surveiller";
  const reasoning = row.data?.reasoning ?? "";
  const factors = row.data?.factors ?? {};
  const factorsBlock = formatFactorsBlock(factors);

  const apiKey = getDeepseekApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Clé API manquante" }, { status: 500 });
  }

  const system = `Tu es un ami passionné de cartes de hockey NHL qui aide des collecteurs normaux à comprendre si un joueur vaut l'investissement. Tu parles simplement, comme dans un texto.

RÈGLES ABSOLUES :
- 2-3 phrases MAX. Jamais plus.
- Commence par une réponse directe (oui/non/ça dépend), puis explique en une phrase simple.
- JAMAIS de jargon technique : interdit de mentionner "PPG", "sous-score", "facteur momentum", "liquidity score", "7.2/10", ou n'importe quel chiffre de facteur interne.
- Traduis tout en langage humain : "il joue vraiment bien ces temps-ci" pas "son momentum est 7.4". "il est encore jeune et progresse" pas "le facteur âge donne 8.0". "le marché n'a pas encore réalisé sa valeur" pas "discrépance marché élevée".
- Reconnais si l'utilisateur soulève un bon point.
- Si hors sujet, ramène au joueur naturellement.

Contexte (pour TOI seulement — ne cite pas ces chiffres) :
- Joueur : ${playerName}
- Score global : ${Number.isFinite(score) ? score.toFixed(1) : "?"}/10 — ${verdict}
- Points forts/faibles (usage interne uniquement) :
${factorsBlock || "(données indisponibles)"}
${reasoning ? `\nContexte algorithmique : ${reasoning}` : ""}`;

  // Construit les messages : system + historique + nouveau message
  const messages = [{ role: "system", content: system }];
  for (const turn of history.slice(-MAX_HISTORY_TURNS)) {
    const role = turn?.role === "assistant" ? "assistant" : "user";
    const content = String(turn?.content ?? "").trim().slice(0, MAX_MESSAGE_LEN);
    if (content) messages.push({ role, content });
  }
  messages.push({ role: "user", content: message });

  let reply = "";
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 400,
        temperature: 0.4,
        messages,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "Erreur DeepSeek" }, { status: 502 });
    }
    const json = await res.json();
    reply = json?.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    console.error("[score/chat] appel DeepSeek échoué:", err?.message ?? err);
    return NextResponse.json({ ok: false, error: "Erreur réseau" }, { status: 502 });
  }

  if (!reply) {
    return NextResponse.json({ ok: false, error: "Réponse vide" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    reply,
    remaining: limit.remaining,
  });
}
