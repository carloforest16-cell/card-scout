import "server-only";

import { getClaudeApiKey } from "@/lib/claudeKey";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const INVESTMENT_SCORE_BATCH_MAX = 15;

const SYSTEM_PROMPT = `Tu es un expert en investissement de cartes NHL.
Pour chaque annonce, gÃ©nÃ¨re un Investment Score basÃ© sur :
1. Le potentiel du joueur (Ã¢ge, stats, trajectoire de carriÃ¨re)
2. Le type de carte (Young Guns et GradÃ©es ont plus de valeur long terme)
3. Le prix vs le prix marchÃ© du groupe
4. La raretÃ© (numÃ©rotÃ©e, patch, auto valent plus)
5. Le timing (joueur en ascension = bon moment d'acheter)

RÃ©ponds UNIQUEMENT en JSON valide (guillemets doubles) :
{
  "listings": [
    {
      "listingIndex": 0,
      "investmentScore": 8.5,
      "holdTimeline": "2 saisons",
      "upside": "Fort",
      "verdict": "Acheter",
      "reason": "Une phrase courte en franÃ§ais"
    }
  ]
}

RÃ¨gles strictes :
- "upside" doit Ãªtre exactement l'un de : "Fort", "Moyen", "Faible"
- "verdict" doit Ãªtre exactement l'un de : "Acheter", "Surveiller", "Passer"
- "investmentScore" : nombre entre 0 et 10, une dÃ©cimale autorisÃ©e
- Une entrÃ©e par annonce fournie, avec le mÃªme listingIndex que dans l'entrÃ©e utilisateur.`;

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

  const apiKey = getClaudeApiKey();
  if (!apiKey) {
    return { ok: false, error: "CS_CLAUDE_KEY manquant", scores: [] };
  }

  const userBlock = [
    `Joueur analysÃ© : ${playerName.trim()}`,
    "",
    "Annonces eBay (JSON) â€” Ã©value chaque entrÃ©e :",
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
      return { ok: false, error: "RÃ©ponse Anthropic illisible", scores: [] };
    }

    const blocks = parsed?.content;
    if (!Array.isArray(blocks)) {
      return { ok: false, error: "Format de rÃ©ponse inattendu", scores: [] };
    }

    const textBlock = blocks.find((b) => b?.type === "text");
    responseText = textBlock?.text ?? "";
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur rÃ©seau",
      scores: [],
    };
  }

  const obj = extractJsonObject(responseText);
  const rawList = obj?.listings;
  if (!Array.isArray(rawList)) {
    return { ok: false, error: "JSON modÃ¨le invalide (listings)", scores: [] };
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
          : "â€”",
      upside: normalizeUpside(row.upside, upsideAllowed),
      verdict: normalizeVerdict(row.verdict),
      reason:
        typeof row.reason === "string" && row.reason.trim()
          ? row.reason.trim()
          : "â€”",
    });
  }

  return { ok: true, scores, error: null };
}

/**
 * Scores dÃ©terministes pour dÃ©mo / sans clÃ© API.
 * @param {Array<{ listingIndex: number; percentOfMarket: number; groupType?: string }>} listings
 */
export function mockInvestmentScores(listings) {
  return listings.map((L) => {
    // Attention : Number(null) === 0 (pas NaN) → on garde null avant de convertir.
    const pct = L.percentOfMarket == null ? NaN : Number(L.percentOfMarket);
    const hasPct = Number.isFinite(pct);
    let score = 5.5;
    if (hasPct) {
      if (pct <= 85) score += 2;
      else if (pct <= 95) score += 1.2;
      else if (pct >= 115) score -= 1.5;
    }
    const gt = String(L.groupType ?? "");
    if (/\bYoung Guns|GradÃ©e|Auto|RPA|NumÃ©rotÃ©|Cup\b/i.test(gt)) score += 0.8;
    score = clampScore(score + (L.listingIndex % 5) * 0.15);
    let verdict = "Surveiller";
    if (score >= 7 && hasPct && pct <= 100) verdict = "Acheter";
    else if (score < 4.5 || (hasPct && pct > 130)) verdict = "Passer";
    const upside =
      score >= 7 ? "Fort" : score >= 5 ? "Moyen" : "Faible";
    return {
      listingIndex: L.listingIndex,
      investmentScore: score,
      holdTimeline: pct <= 90 ? "2â€“3 saisons" : "1 saison",
      upside,
      verdict,
      reason:
        verdict === "Acheter"
          ? "Prix attractif vs mÃ©diane du segment."
          : verdict === "Passer"
            ? "Prix Ã©levÃ© ou profil moins favorable Ã  court terme."
            : "Attendre une meilleure entrÃ©e ou plus de donnÃ©es.",
    };
  });
}
