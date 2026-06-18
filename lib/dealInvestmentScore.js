import "server-only";

import { getDeepseekApiKey } from "@/lib/deepseekKey";

const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export const INVESTMENT_SCORE_BATCH_MAX = 15;

const SYSTEM_PROMPT = `Tu es un expert en investissement de cartes de hockey NHL.

HIÉRARCHIE DE VALEUR DES CARTES (du plus au moins précieux long terme) :
1. Auto/Patch/RPA numérotés (/99 ou moins) — valeur maximale, très liquide
2. Young Guns RC PSA 10 — pilier du marché, demande constante
3. Gradé PSA/BGS haute note (9-10) — prime de grade justifiée
4. Young Guns RC raw — base saine, marché large
5. Canvas/SP RC — collection, moins liquide
6. Parallèle de base, lot, fan art — éviter sauf rabais extrême (>40% sous marché)

RÈGLES DE PRIX (percentOfMarket) :
- ≤75% → exceptionnel, fort biais Acheter
- 76-90% → bon deal, favorable
- 91-110% → neutre, justifié seulement si carte rare
- >110% → cher, biais Passer sauf rareté exceptionnelle

PROFIL JOUEUR sur la valeur des cartes :
- ≤23 ans + stats solides → fort potentiel d'appréciation, biais haussier
- Run de playoffs récent et chaud → demande en temps réel, acheter maintenant
- Joueur en progression (PPG en hausse) → fenêtre d'achat idéale
- Joueur ≥32 ans ou en déclin → seulement si prix très agressif (<80% marché)
- Retraité → valeur stable mais upside limité, timeline longue

Réponds UNIQUEMENT en JSON valide (guillemets doubles) :
{
  "listings": [
    {
      "listingIndex": 0,
      "investmentScore": 8.5,
      "holdTimeline": "2 saisons",
      "upside": "Fort",
      "verdict": "Acheter",
      "reason": "Une phrase courte en français qui cite le facteur décisif"
    }
  ]
}

Règles strictes :
- "upside" doit être exactement l'un de : "Fort", "Moyen", "Faible"
- "verdict" doit être exactement l'un de : "Acheter", "Surveiller", "Passer"
- "investmentScore" : nombre entre 0 et 10, une décimale autorisée
- Une entrée par annonce fournie, avec le même listingIndex que dans l'entrée utilisateur.
- "reason" : phrase de 10-20 mots MAX, OBLIGATOIREMENT personnalisée. Combine 2-3 de ces éléments réels : type de carte exact (ex: "Young Guns RC"), âge ou statut du joueur, % vs marché, grade PSA/BGS si applicable, run playoffs si récent. INTERDIT : phrases génériques comme "prix attractif", "bon potentiel", "carte intéressante". EXEMPLES CORRECTS : "YG RC #2 pick à -17% marché, Wright 22 ans en progression SEA" / "PSA 10 Young Guns à cote, joueur de 23 ans top-5 draft" / "Auto numérotée /99 à -23% — Caufield post-séries MTL 31 buts"`.trim();

/**
 * @param {string} text
 * @returns {object | null}
 */
function extractJsonObject(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {unknown} n
 * @returns {number}
 */
function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 5;
  return Math.round(Math.min(10, Math.max(0, x)) * 10) / 10;
}

/**
 * @param {unknown} v
 * @param {("Fort"|"Moyen"|"Faible")[]} allowed
 */
function normalizeUpside(v, allowed) {
  const s = typeof v === "string" ? v.trim() : "";
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  return hit ?? "Moyen";
}

/**
 * @param {unknown} v
 */
function normalizeVerdict(v) {
  const allowed = ["Acheter", "Surveiller", "Passer"];
  const s = typeof v === "string" ? v.trim() : "";
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  return hit ?? "Surveiller";
}

/**
 * @param {Array<{
 *   listingIndex: number;
 *   title: string;
 *   price: number;
 *   groupType: string;
 *   marketPrice: number;
 *   percentOfMarket: number;
 * }>} batch
 */
export async function scoreListingsForInvestment(playerName, batch, playerContext = null) {
  if (!batch.length) {
    return { ok: true, scores: [] };
  }

  const apiKey = getDeepseekApiKey();
  if (!apiKey) {
    return { ok: false, error: "DEEPSEEK_API_KEY manquant", scores: [] };
  }

  const contextLines = [];
  if (playerContext) {
    contextLines.push("CONTEXTE JOUEUR (utilise ces données pour affiner chaque score) :");
    if (playerContext.ageYears != null) contextLines.push(`- Âge : ${playerContext.ageYears} ans`);
    if (playerContext.position) contextLines.push(`- Position : ${playerContext.position}`);
    if (playerContext.teamAbbrev) contextLines.push(`- Équipe : ${playerContext.teamAbbrev}`);
    if (playerContext.nhlSeasons != null) contextLines.push(`- Saisons NHL : ${playerContext.nhlSeasons}`);
    if (playerContext.draftOverall != null) contextLines.push(`- Rang de repêchage : #${playerContext.draftOverall} overall`);
    if (playerContext.pointsPerGame != null) {
      const gp = playerContext.gamesPlayed ?? "?";
      const g = playerContext.goals ?? "?";
      const a = playerContext.assists ?? "?";
      contextLines.push(`- Stats ${playerContext.seasonLabel ?? "saison actuelle"} : ${gp} PJ, ${g}B ${a}A, ${playerContext.pointsPerGame} pts/match`);
    }
    if (playerContext.recentFormPpg != null) {
      const trend = playerContext.recentFormPpg > (playerContext.pointsPerGame ?? 0) ? "🔥 EN FEU" : playerContext.recentFormPpg < (playerContext.pointsPerGame ?? 0) * 0.7 ? "❄️ FROID" : "stable";
      contextLines.push(`- Forme récente (5 derniers matchs) : ${playerContext.recentFormPpg} pts/match — ${trend}`);
    }
    if (playerContext.playoffs && Number(playerContext.playoffs.monthsSinceEnd) <= 10 && Number(playerContext.playoffs.gamesPlayed) >= 5) {
      contextLines.push(`- 🏒 Run playoffs ${playerContext.playoffs.seasonLabel} : ${playerContext.playoffs.points} pts en ${playerContext.playoffs.gamesPlayed} matchs (${playerContext.playoffs.pointsPerGame} pts/match) — il y a ${playerContext.playoffs.monthsSinceEnd} mois`);
    }
    if (playerContext.isRetired) contextLines.push("- ⚠️ JOUEUR RETRAITÉ — upside limité, valeur stable");
    contextLines.push("");
  }

  const userBlock = [
    `Joueur analysé : ${playerName.trim()}`,
    "",
    ...contextLines,
    "Annonces eBay (JSON)  -  évalue chaque entrée :",
    JSON.stringify(
      batch.map((b) => ({
        listingIndex: b.listingIndex,
        title: b.title,
        priceCad: b.price,
        groupType: b.groupType,
        marketPriceGroup: b.marketPrice,
        percentOfMarket: b.percentOfMarket,
      })),
      null,
      2
    ),
  ].join("\n");

  let responseText = "";
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 4096,
        temperature: 0.25,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userBlock },
        ],
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `DeepSeek ${res.status}: ${raw.slice(0, 200)}`,
        scores: [],
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Réponse DeepSeek illisible", scores: [] };
    }

    responseText = parsed?.choices?.[0]?.message?.content ?? "";
    if (!responseText) {
      return { ok: false, error: "Format de réponse inattendu", scores: [] };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur réseau",
      scores: [],
    };
  }

  const obj = extractJsonObject(responseText);
  const rawList = obj?.listings;
  if (!Array.isArray(rawList)) {
    return { ok: false, error: "JSON modèle invalide (listings)", scores: [] };
  }

  const upsideAllowed = ["Fort", "Moyen", "Faible"];
  /** @type {Array<{ listingIndex: number; investmentScore: number; holdTimeline: string; upside: string; verdict: string; reason: string }>} */
  const scores = [];
  for (const row of rawList) {
    if (!row || typeof row !== "object") continue;
    const listingIndex = Number(row.listingIndex);
    if (!Number.isInteger(listingIndex) || listingIndex < 0) continue;
    scores.push({
      listingIndex,
      investmentScore: clampScore(row.investmentScore),
      holdTimeline:
        typeof row.holdTimeline === "string" && row.holdTimeline.trim()
          ? row.holdTimeline.trim()
          : " - ",
      upside: normalizeUpside(row.upside, upsideAllowed),
      verdict: normalizeVerdict(row.verdict),
      reason:
        typeof row.reason === "string" && row.reason.trim()
          ? row.reason.trim()
          : " - ",
    });
  }

  return { ok: true, scores, error: null };
}

/**
 * Scores déterministes pour démo / sans clé API.
 * @param {Array<{ listingIndex: number; percentOfMarket: number; groupType?: string }>} listings
 */
export function mockInvestmentScores(listings) {
  return listings.map((L) => {
    const pct = L.percentOfMarket == null ? NaN : Number(L.percentOfMarket);
    const hasPct = Number.isFinite(pct);
    let score = 5.5;
    if (hasPct) {
      if (pct <= 85) score += 2;
      else if (pct <= 95) score += 1.2;
      else if (pct >= 115) score -= 1.5;
    }
    const gt = String(L.groupType ?? "");
    if (/\bYoung Guns|Gradée|Auto|RPA|Numéroté|Cup\b/i.test(gt)) score += 0.8;
    score = clampScore(score + (L.listingIndex % 5) * 0.15);
    let verdict = "Surveiller";
    if (score >= 7 && hasPct && pct <= 100) verdict = "Acheter";
    else if (score < 4.5 || (hasPct && pct > 130)) verdict = "Passer";
    const upside =
      score >= 7 ? "Fort" : score >= 5 ? "Moyen" : "Faible";
    return {
      listingIndex: L.listingIndex,
      investmentScore: score,
      holdTimeline: pct <= 90 ? "2-3 saisons" : "1 saison",
      upside,
      verdict,
      reason:
        verdict === "Acheter"
          ? "Prix attractif vs médiane du segment."
          : verdict === "Passer"
            ? "Prix élevé ou profil moins favorable à court terme."
            : "Attendre une meilleure entrée ou plus de données.",
    };
  });
}
