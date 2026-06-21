import { NextResponse } from "next/server";

import { getDeepseekApiKey } from "@/lib/deepseekKey";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const MAX_HISTORY_TURNS = 10;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_MESSAGE_LEN = 800;

/** Compteur in-memory : key = `${userId}|${playerId}` → { count, windowStart } */
const rateLimitMap = new Map();

function checkRateLimit(userKey) {
  const now = Date.now();
  const entry = rateLimitMap.get(userKey);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userKey, { count: 1, windowStart: now });
    return { ok: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    const resetIn = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { ok: false, resetIn };
  }
  entry.count += 1;
  return { ok: true, remaining: RATE_LIMIT_MAX - entry.count };
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

  const playerId = String(body?.playerId ?? "").trim();
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

  const userKey = `${userId}|${playerId}`;
  const limit = checkRateLimit(userKey);
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

  const system = `Tu es l'analyste Card Metrics. Tu défends et expliques le score d'investissement Card Metrics d'un joueur NHL face aux questions de l'utilisateur.

Règles :
- Réponds en français, ton direct et factuel
- Cite des chiffres précis (PPG, score d'un facteur, âge)
- Reconnais quand l'utilisateur soulève un bon point — mais explique pourquoi l'algo pèse les choses comme il le fait
- 2-4 phrases max par réponse, pas de préambule
- Si l'utilisateur sort du sujet (météo, autre sport), ramène poliment au score du joueur
- Ne te présente pas comme une IA, parle comme un analyste de cartes

Contexte joueur :
- Nom : ${playerName}
- Score Card Metrics : ${Number.isFinite(score) ? score.toFixed(1) : "?"}/10
- Verdict : ${verdict}

Facteurs (sur 10) :
${factorsBlock || "(données indisponibles)"}

${reasoning ? `Reasoning algo : ${reasoning}` : ""}`;

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
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "Erreur DeepSeek" }, { status: 502 });
    }
    const json = await res.json();
    reply = json?.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
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
