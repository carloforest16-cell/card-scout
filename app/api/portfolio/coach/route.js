import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { getDeepseekApiKey } from "@/lib/deepseekKey";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

// 6h per-user in-memory cache
const coachCache = new Map();
const CACHE_TTL = 6 * 3600 * 1000;

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cached = coachCache.get(user.id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json({ ...cached.data, cached: true });
  }

  const body = await request.json().catch(() => ({}));
  const { cards = [], values = [] } = body;

  if (cards.length === 0) {
    return NextResponse.json({ error: "portfolio vide" }, { status: 400 });
  }

  // Enrich with Card Scout scores from Supabase
  const admin = getSupabaseAdmin();
  const playerIds = [...new Set(cards.map((c) => c.player_id))];
  const { data: scores } = await admin
    .from("player_scores")
    .select("player_id, player_name, score, tier, data")
    .in("player_id", playerIds);

  const scoreMap = {};
  (scores ?? []).forEach((s) => { scoreMap[s.player_id] = s; });

  // Build portfolio summary for the AI
  const summary = cards.map((card) => {
    const val = values.find((v) => v.cardId === card.id);
    const score = scoreMap[card.player_id];
    return {
      joueur: card.player_name,
      equipe: card.team ?? "?",
      typeCarte: card.card_type,
      grade: card.grade,
      tirage: card.print_run ? `/${card.print_run}` : "non numérotée",
      prixAchatCad: Number(card.purchase_price_cad),
      valeurEstimeeCad: val?.estimatedValueCad ?? null,
      deltaPct: val?.deltaPct ?? null,
      cardScoutScore: score?.score ?? null,
      cardScoutTier: score?.tier ?? null,
    };
  });

  const apiKey = getDeepseekApiKey();
  if (!apiKey) return NextResponse.json({ error: "Clé API manquante" }, { status: 500 });

  const system = `Tu es un expert en investissement de cartes de hockey NHL.
Voici le portfolio de cartes d'un collectionneur. Analyse-le et donne 3 recommandations concrètes et actionnables.

Réponds UNIQUEMENT en JSON valide (guillemets doubles) avec exactement ce format :
{
  "garder": [
    { "joueur": "string", "raison": "string (max 120 car.)" }
  ],
  "vendre": [
    { "joueur": "string", "raison": "string (max 120 car.)" }
  ],
  "acheter": [
    { "suggestion": "string (type de carte + joueur suggéré)", "raison": "string (max 120 car.)" }
  ],
  "resume": "string (2 phrases max sur l'état général du portfolio)"
}

Règles : max 3 items par catégorie, soit direct et actionnable, base-toi sur les scores Card Scout et les deltas de valeur.`;

  const userBlock = `Portfolio :\n${JSON.stringify(summary, null, 2)}`;

  let text = "";
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userBlock },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: "Erreur API IA" }, { status: 500 });
    const data = await res.json();
    text = data?.choices?.[0]?.message?.content ?? "";
  } catch {
    return NextResponse.json({ error: "Erreur réseau IA" }, { status: 500 });
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return NextResponse.json({ error: "Réponse IA invalide" }, { status: 500 });

  let coach;
  try {
    coach = JSON.parse(text.slice(start, end + 1));
  } catch {
    return NextResponse.json({ error: "Parse JSON échoué" }, { status: 500 });
  }

  coachCache.set(user.id, { data: coach, fetchedAt: Date.now() });
  return NextResponse.json(coach);
}
