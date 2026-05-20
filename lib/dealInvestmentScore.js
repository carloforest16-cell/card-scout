import "server-only";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const INVESTMENT_SCORE_BATCH_MAX = 15;

const SYSTEM_PROMPT = `Tu es un expert en investissement de cartes NHL.
Pour chaque annonce, génère un Investment Score basé sur :
1. Le potentiel du joueur (âge, stats, trajectoire de carrière)
2. Le type de carte (Young Guns et Gradées ont plus de valeur long terme)
3. Le prix vs le prix marché du groupe
4. La rareté (numérotée, patch, auto valent plus)
5. Le timing (joueur en ascension = bon moment d'acheter)

Réponds UNIQUEMENT en JSON valide (guillemets doubles) :
{
  "listings": [
    {
      "listingIndex": 0,
      "investmentScore": 8.5,
      "holdTimeline": "2 saisons",
      "upside": "Fort",
      "verdict": "Acheter",
      "reason": "Une phrase courte en français"
    }
  ]
}

Règles strictes :
- "upside" doit être exactement l'un de : "Fort", "Moyen", "Faible"
- "verdict" doit être exactement l'un de : "Acheter", "Surveiller", "Passer"
- "investmentScore" : nombre entre 0 et 10, une décimale autorisée
- Une entrée par annonce fournie, avec le même listingIndex que dans l'entrée utilisateur.`;

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
export async function scoreListingsForInvestment(playerName, batch) {
  if (!batch.length) {
    return { ok: true, scores: [] };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY manquant", scores: [] };
  }

  const userBlock = [
    `Joueur analysé : ${playerName.trim()}`,
    "",
    "Annonces eBay (JSON) — évalue chaque entrée :",
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
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        temperature: 0.25,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userBlock }],
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `Anthropic ${res.status}: ${raw.slice(0, 200)}`,
        scores: [],
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Réponse Anthropic illisible", scores: [] };
    }

    const blocks = parsed?.content;
    if (!Array.isArray(blocks)) {
      return { ok: false, error: "Format de réponse inattendu", scores: [] };
    }

    const textBlock = blocks.find((b) => b?.type === "text");
    responseText = textBlock?.text ?? "";
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
          : "—",
      upside: normalizeUpside(row.upside, upsideAllowed),
      verdict: normalizeVerdict(row.verdict),
      reason:
        typeof row.reason === "string" && row.reason.trim()
          ? row.reason.trim()
          : "—",
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
    const pct = L.percentOfMarket;
    let score = 5.5;
    if (pct <= 85) score += 2;
    else if (pct <= 95) score += 1.2;
    else if (pct >= 115) score -= 1.5;
    const gt = String(L.groupType ?? "");
    if (/\bYoung Guns|Gradée|Auto|RPA|Numéroté|Cup\b/i.test(gt)) score += 0.8;
    score = clampScore(score + (L.listingIndex % 5) * 0.15);
    let verdict = "Surveiller";
    if (score >= 7 && pct <= 100) verdict = "Acheter";
    else if (score < 4.5 || pct > 130) verdict = "Passer";
    const upside =
      score >= 7 ? "Fort" : score >= 5 ? "Moyen" : "Faible";
    return {
      listingIndex: L.listingIndex,
      investmentScore: score,
      holdTimeline: pct <= 90 ? "2–3 saisons" : "1 saison",
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
