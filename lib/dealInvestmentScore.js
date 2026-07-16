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
- "verdict" doit être exactement l'un de : "Acheter", "Chercher mieux", "Passer"
- "investmentScore" : nombre entre 0 et 10, une décimale autorisée
- Une entrée par annonce fournie, avec le même listingIndex que dans l'entrée utilisateur.
- RÈGLE DE COHÉRENCE JOUEUR : si le contexte inclut un "Card Metrics Score", l'investmentScore NE PEUT PAS dépasser ce score + 1.5. Exemple : joueur 5.2/10 → score max 6.7, verdict max "Chercher mieux". Joueur 8.5/10 → score libre jusqu'à 10.
- "reason" : UNE phrase de 10-20 mots, OBLIGATOIREMENT spécifique à cette annonce précise. Tu DOIS mentionner AU MOINS 2 éléments concrets tirés des données : le type de carte exact, le % vs marché, l'âge du joueur, le grade PSA/BGS, ou les stats. ABSOLUMENT INTERDIT — si tu écris l'un de ces mots tu as échoué : "attractif", "potentiel", "intéressant", "standard", "bon deal", "favorable", "à surveiller", "profil". EXEMPLES OBLIGATOIRES à imiter : "YG RC à -17% marché, Raymond 22 ans C EDM en progression" / "PSA 10 Young Guns à 94% cote, Caufield 23 ans 31B MTL" / "Auto /99 à -23% — Tkachuk post-séries FLA 24G en playoffs" / "Canvas SP à 88% cote, Crosby 36 ans déclin probable"`.trim();

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
  const allowed = ["Acheter", "Chercher mieux", "Passer"];
  const s = typeof v === "string" ? v.trim() : "";
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  return hit ?? "Chercher mieux";
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
    if (playerContext.cardMetricsScore != null) {
      const cap = Math.min(10, playerContext.cardMetricsScore + 1.5).toFixed(1);
      contextLines.push(`- Card Metrics Score (qualité investissement joueur) : ${playerContext.cardMetricsScore}/10 → investmentScore plafonné à ${cap}/10`);
    }
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
        temperature: 0,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userBlock },
        ],
      }),
      signal: AbortSignal.timeout(30000),
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
 * Formate un prix CAD compact ("34 $", "1 250 $") pour insertion dans une phrase.
 * @param {number} n
 */
function fmtCad(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return `${Math.round(x).toLocaleString("fr-CA")} $`;
}

/**
 * Reason quand la cohorte n'est pas assez fiable pour un pourcentage (comps<4)
 * mais qu'une estimation de juste valeur existe (comps ≥ 1). On donne des chiffres
 * réels (estimation + nombre de comparables) au lieu du fallback générique
 * « données limitées », plus utile pour le collectionneur.
 * @param {string} gt
 * @param {number | null | undefined} fairValueCad
 * @param {number | null | undefined} fairValueComps
 * @param {string | null} year
 */
function buildLowConfidenceReason(gt, fairValueCad, fairValueComps, year) {
  const priceStr = fmtCad(fairValueCad);
  const comps = Number(fairValueComps) || 0;
  const label = gt || "Carte";
  const yearStr = year ? ` (${year})` : "";
  if (priceStr && comps >= 2) {
    return `${label}${yearStr} — estimation ${priceStr} sur ${comps} comparables actifs, signal peu fiable.`;
  }
  if (priceStr && comps === 1) {
    return `${label}${yearStr} — un seul comparable actif à ${priceStr}, à valider manuellement.`;
  }
  return `${label}${yearStr} — données marché limitées, comparer manuellement.`;
}

/**
 * Génère une raison heuristique spécifique à partir des données de la carte.
 * @param {{ title?: string; groupType?: string; percentOfMarket?: number; fairValueCad?: number; fairValueComps?: number }} L
 */
function buildHeuristicReason(L) {
  const title = String(L.title ?? "");
  const gt = String(L.groupType ?? "");
  // Attention : percentOfMarket est explicitement mis à `null` par le pipeline
  // quand la cohorte manque de comps fiables (dealFinder.js, FAIR_VALUE_TRUST_COMPS).
  // Number(null) === 0 → sans ce guard, on affichait « à 0% de la cote » sur des
  // cartes clairement au-dessus/au prix du marché.
  const pct = L.percentOfMarket == null ? NaN : Number(L.percentOfMarket);
  const hasPct = Number.isFinite(pct);

  const yearMatch = title.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;
  const psa = title.match(/\b(PSA|BGS|SGC)\s*(\d+\.?\d*)/i);
  const grade = psa ? `${psa[1].toUpperCase()} ${psa[2]}` : null;
  const pctStr = hasPct ? ` à ${pct}%` : "";

  // Branches sans pct : on tombe sur buildLowConfidenceReason qui mentionne
  // l'estimation + le nombre de comparables (utile) au lieu du générique
  // « données limitées ». Ex : « Un seul comparable actif à 34 $, à valider ».
  if (grade) {
    if (hasPct && pct <= 90) return `${grade}${pctStr} de la cote — prime de grade bien intégrée${year ? ` (${year})` : ""}.`;
    if (hasPct && pct >= 112) return `${grade} au-dessus de la cote — évaluer la prime vs alternatives raw.`;
    if (hasPct) return `${grade}${pctStr} — carte gradée liquide, vérifier les comparables récents.`;
    return buildLowConfidenceReason(grade, L.fairValueCad, L.fairValueComps, year);
  }
  if (/Young Guns|YG/i.test(gt)) {
    if (hasPct && pct <= 82) return `Young Guns RC${pctStr} de la cote${year ? ` (${year})` : ""} — fenêtre d'achat favorable.`;
    if (hasPct && pct >= 110) return `Young Guns RC au-dessus de la cote — patienter ou chercher mieux.`;
    if (hasPct) return `Young Guns RC au prix standard${year ? ` (${year})` : ""} — carte flagship liquide.`;
    return buildLowConfidenceReason("Young Guns RC", L.fairValueCad, L.fairValueComps, year);
  }
  if (/Auto|RPA|Patch/i.test(gt)) {
    if (hasPct && pct <= 88) return `Auto/patch${pctStr} de la cote — actif rare sous-évalué.`;
    if (hasPct) return `Auto/patch${pctStr} — actif rare, à comparer aux ventes récentes.`;
    return buildLowConfidenceReason("Auto/patch", L.fairValueCad, L.fairValueComps, year);
  }
  if (/Gradée|Graded/i.test(gt)) {
    if (hasPct && pct <= 90) return `Gradée${pctStr} de la cote — bon rapport qualité/prix.`;
    if (hasPct) return `Gradée${pctStr} — prime à valider vs versions non gradées.`;
    return buildLowConfidenceReason("Gradée", L.fairValueCad, L.fairValueComps, year);
  }
  if (hasPct && pct <= 78) return `${gt || "Carte"}${pctStr} de la cote — opportunité sous le marché actif.`;
  if (hasPct && pct >= 118) return `${gt || "Carte"} au-dessus de la cote — explorer les alternatives moins chères.`;
  if (hasPct) return `${gt || "Carte"}${pctStr} de la cote — dans la fourchette normale du marché.`;
  return buildLowConfidenceReason(gt, L.fairValueCad, L.fairValueComps, year);
}

/**
 * Dérive un score de qualité joueur (0-10) depuis le playerContext.
 * Utilise cardMetricsScore s'il est disponible, sinon calcule depuis les stats NHL.
 * @param {{ cardMetricsScore?: number; pointsPerGame?: number; ageYears?: number; draftOverall?: number } | null} ctx
 * @returns {number | null}
 */
function derivePlayerQuality(ctx) {
  if (!ctx) return null;
  if (ctx.cardMetricsScore != null) return ctx.cardMetricsScore;

  const ppg = ctx.pointsPerGame ?? 0;
  const age = ctx.ageYears;
  const draft = ctx.draftOverall;

  const ppgScore =
    ppg >= 0.9 ? 9 : ppg >= 0.7 ? 7.5 : ppg >= 0.5 ? 6 : ppg >= 0.3 ? 4 : ppg > 0 ? 2.5 : 2;
  const ageScore =
    age == null ? 5 : age <= 21 ? 8.5 : age <= 23 ? 7.5 : age <= 26 ? 6 : age <= 29 ? 5 : age <= 32 ? 4 : 2.5;
  const draftScore =
    draft == null ? 5 : draft <= 5 ? 9.5 : draft <= 15 ? 8 : draft <= 30 ? 6.5 : draft <= 75 ? 5 : 4;

  return Math.round(((ppgScore * 1.5 + ageScore + draftScore * 0.5) / 3) * 10) / 10;
}

/**
 * Scores déterministes pour démo / sans clé API.
 * Blende le score de prix (40%) avec la qualité du joueur (60%).
 * @param {Array<{ listingIndex: number; percentOfMarket: number; groupType?: string; title?: string }>} listings
 * @param {{ cardMetricsScore?: number; pointsPerGame?: number; ageYears?: number; draftOverall?: number } | null} [playerContext]
 */
export function mockInvestmentScores(listings, playerContext = null) {
  const playerQuality = derivePlayerQuality(playerContext);

  return listings.map((L) => {
    const pct = L.percentOfMarket == null ? NaN : Number(L.percentOfMarket);
    const hasPct = Number.isFinite(pct);

    // Score basé sur le prix (0-10). Les branches de pénalité vont du plus
    // sévère au moins sévère : >=130 doit être testé AVANT >=115 (sinon la
    // pénalité -2.5 est du code mort et un 135% n'écope que de -1.5).
    let priceScore = 5.5;
    if (hasPct) {
      if (pct <= 75) priceScore += 2.5;
      else if (pct <= 85) priceScore += 2;
      else if (pct <= 95) priceScore += 1.2;
      else if (pct >= 130) priceScore -= 2.5;
      else if (pct >= 115) priceScore -= 1.5;
    }
    const gt = String(L.groupType ?? "");
    if (/Young Guns|Gradée|Auto|RPA|Numéroté|Cup/i.test(gt)) priceScore += 0.5;
    priceScore = Math.min(10, Math.max(0, priceScore + (L.listingIndex % 5) * 0.1));

    // Blend prix + qualité joueur. Le plafond de cohérence joueur (score ≤ CM+1.5)
    // n'est PAS appliqué ici : il l'est en aval par applyPlayerQualityCap, pour
    // les scores heuristiques ET DeepSeek — une seule source de vérité.
    const score = clampScore(
      playerQuality != null
        ? priceScore * 0.4 + playerQuality * 0.6
        : priceScore
    );

    let verdict = "Chercher mieux";
    if (score >= 7 && hasPct && pct <= 105) verdict = "Acheter";
    else if (score < 4.5 || (hasPct && pct > 130)) verdict = "Passer";
    const upside = score >= 7.5 ? "Fort" : score >= 5.5 ? "Moyen" : "Faible";

    return {
      listingIndex: L.listingIndex,
      investmentScore: score,
      holdTimeline: hasPct && pct <= 90 ? "2-3 saisons" : "1-2 saisons",
      upside,
      verdict,
      reason: buildHeuristicReason(L),
    };
  });
}

/**
 * Plafond de cohérence joueur appliqué à un score final — heuristique OU DeepSeek.
 * L'investmentScore ne dépasse pas la qualité du joueur + 1.5 (règle écrite dans
 * le SYSTEM_PROMPT, mais un LLM peut l'ignorer → on l'impose ici de façon
 * déterministe pour les DEUX sources). Sans contexte joueur : plafond 7.0 —
 * permet encore « Acheter/Moyen » sur un vrai rabais (nécessaire au mode démo et
 * aux recherches dont le joueur n'est pas résolu), mais jamais « Fort » pour un
 * inconnu. Downgrade cohérent du verdict/upside quand le score est rogné.
 * @template {{ investmentScore?: number; verdict?: string; upside?: string }} T
 * @param {T} row
 * @param {object | null} [playerContext]
 * @returns {T}
 */
export function applyPlayerQualityCap(row, playerContext = null) {
  const q = derivePlayerQuality(playerContext);
  const cap = q != null ? q + 1.5 : 7.0;
  const score = Number(row.investmentScore) || 0;
  if (score <= cap) return row;
  const capped = Math.round(Math.min(cap, 10) * 10) / 10;
  let verdict = row.verdict;
  let upside = row.upside;
  if (capped < 7 && String(verdict ?? "").toLowerCase().includes("acheter")) {
    verdict = "Chercher mieux";
  }
  if (capped < 7.5 && upside === "Fort") upside = "Moyen";
  return { ...row, investmentScore: capped, verdict, upside };
}
