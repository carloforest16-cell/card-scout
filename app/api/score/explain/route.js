import { NextResponse } from "next/server";

import { getDeepseekApiKey } from "@/lib/deepseekKey";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

/**
 * Explique pourquoi le Card Metrics Score d'un joueur a changé sur une fenêtre.
 *
 * GET /api/score/explain?playerId=X&days=14
 *
 * Lit player_scores (snapshot actuel) + player_scores_history (snapshot le plus
 * ancien dans la fenêtre), calcule le delta + identifie les facteurs qui ont le
 * plus changé, et demande à DeepSeek une explication courte en français.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get("playerId");
  const days = Math.max(1, Math.min(90, Number(searchParams.get("days") || 14)));

  if (!playerId) {
    return NextResponse.json({ ok: false, error: "playerId requis" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Score actuel + factor breakdown
  const { data: currentRow } = await db
    .from("player_scores")
    .select("player_name, score, data")
    .eq("player_id", String(playerId))
    .single();

  if (!currentRow) {
    return NextResponse.json({ ok: false, error: "Joueur sans score" }, { status: 404 });
  }

  const newScore = Number(currentRow.score);
  const newFactors = currentRow.data?.factors ?? null;

  // Historique
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data: history } = await db
    .from("player_scores_history")
    .select("snapshot_date, score, score_breakdown")
    .eq("player_id", String(playerId))
    .gte("snapshot_date", sinceStr)
    .order("snapshot_date", { ascending: true });

  if (!history || history.length === 0) {
    return NextResponse.json({
      ok: true,
      delta: null,
      oldScore: null,
      newScore,
      explanation: "Pas encore assez d'historique pour expliquer une évolution. Reviens dans quelques jours.",
      changedFactors: [],
      sparkline: [],
    });
  }

  const oldest = history[0];
  const oldScore = Number(oldest.score);
  const oldFactors = oldest.score_breakdown ?? null;
  const delta = Math.round((newScore - oldScore) * 10) / 10;

  // Identifie les facteurs qui ont le plus changé
  const changedFactors = [];
  if (oldFactors && newFactors) {
    for (const key of Object.keys(newFactors)) {
      if (key === "weightedScore" || key === "scoreAdjustment") continue;
      const oldVal = Number(oldFactors?.[key]?.score ?? oldFactors?.[key]);
      const newVal = Number(newFactors?.[key]?.score ?? newFactors?.[key]);
      if (!Number.isFinite(oldVal) || !Number.isFinite(newVal)) continue;
      const diff = newVal - oldVal;
      if (Math.abs(diff) >= 0.5) {
        changedFactors.push({
          key,
          oldValue: Math.round(oldVal * 10) / 10,
          newValue: Math.round(newVal * 10) / 10,
          diff: Math.round(diff * 10) / 10,
        });
      }
    }
    changedFactors.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }

  // Sparkline data (jusqu'à 30 points)
  const sparkline = history.slice(-30).map((row) => ({
    date: row.snapshot_date,
    score: Number(row.score),
  }));

  // Si pas de changement significatif → pas besoin d'appel IA
  if (Math.abs(delta) < 0.3 && changedFactors.length === 0) {
    return NextResponse.json({
      ok: true,
      delta,
      oldScore,
      newScore,
      explanation: "Le score est stable sur la période. Aucun facteur n'a changé de manière significative.",
      changedFactors,
      sparkline,
    });
  }

  // Appel DeepSeek pour l'explication narrative
  const apiKey = getDeepseekApiKey();
  let explanation = `Le score est passé de ${oldScore.toFixed(1)} à ${newScore.toFixed(1)} sur ${days} jours.`;

  if (apiKey) {
    const playerName = currentRow.player_name ?? "ce joueur";
    const factorsLines = changedFactors.slice(0, 5).map((f) => {
      const sign = f.diff > 0 ? "+" : "";
      return `- ${f.key}: ${f.oldValue} → ${f.newValue} (${sign}${f.diff})`;
    }).join("\n");

    const system = `Tu es un analyste de cartes de hockey NHL. Tu expliques en 2-3 phrases factuelles pourquoi un score d'investissement a évolué. Réponds en français, sans préambule, va droit au but. Ne mentionne pas que tu es une IA.`;
    const user = `Joueur : ${playerName}
Score il y a ${days} jours : ${oldScore.toFixed(1)}/10
Score actuel : ${newScore.toFixed(1)}/10
Delta : ${delta > 0 ? "+" : ""}${delta.toFixed(1)}

Facteurs qui ont le plus changé :
${factorsLines || "(aucun changement significatif au niveau des facteurs)"}

Explique en 2-3 phrases pourquoi le score a évolué ainsi.`;

    try {
      const res = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          max_tokens: 250,
          temperature: 0.3,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content?.trim();
        if (text) explanation = text;
      }
    } catch {
      // garde le fallback
    }
  }

  return NextResponse.json({
    ok: true,
    delta,
    oldScore,
    newScore,
    explanation,
    changedFactors: changedFactors.slice(0, 5),
    sparkline,
  });
}
