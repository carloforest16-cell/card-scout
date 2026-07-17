import "server-only";

import { getDeepseekApiKey } from "@/lib/deepseekKey";

const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/** Nb max de titres de ventes envoyés à DeepSeek en un appel. */
export const COMP_MATCH_BATCH_MAX = 40;

const SYSTEM_PROMPT = `Tu es un expert en cartes de hockey NHL et en identification de cartes depuis des titres d'annonces eBay.

On te donne une CARTE CIBLE (le titre d'une annonce eBay) et une liste de VENTES (titres d'annonces vendues). Ta tâche : identifier quelles ventes concernent EXACTEMENT la même carte physique que la cible.

"Exactement la même carte" veut dire TOUS ces critères à la fois :
1. Même joueur.
2. Même année/saison de production (ex: 2023-24). Un titre "2023" et un titre "2023-24" désignent la même saison.
3. Même set/produit (ex: Upper Deck Series 1, SP Authentic, The Cup, OPC Platinum). Attention aux abréviations : "UD" = Upper Deck, "OPC" = O-Pee-Chee, "SPA" = SP Authentic, "YG" = Young Guns.
4. Même numéro de carte si les deux titres en donnent un (#201 ≠ #451).
5. Même variante : base vs parallèle (couleur : gold, blue, red…), même insert nommé, même tirage limité (/99, /25…). Une base et son parallèle gold sont des cartes DIFFÉRENTES.
6. Même statut autographe/patch : un auto et un non-auto sont DIFFÉRENTS.
7. Même état de grading : raw (non gradé) vs gradé, ET même compagnie + même note (PSA 10 ≠ PSA 9 ≠ BGS 9.5 ≠ raw). "Gem Mint 10" avec PSA = PSA 10.

Règles de jugement :
- Les titres eBay sont bruités (mots dans le désordre, fautes, mots marketing). Juge sur le fond, pas sur la forme.
- Si un critère est ABSENT des deux titres, considère-le compatible.
- Si un critère est présent dans un seul des deux titres et qu'il rend la carte plus rare/chère (parallèle, auto, grade, tirage), considère les cartes DIFFÉRENTES par prudence.
- Exclus les lots (2+ cartes), les reprints, les cartes custom/fan art, les breaks/spots.

Réponds UNIQUEMENT en JSON valide :
{"matches": [0, 3, 7]}
où chaque nombre est l'index d'une vente qui est exactement la même carte que la cible. Liste vide si aucune.`.trim();

/**
 * @param {string} text
 * @returns {object | null}
 */
function extractJsonObject(text) {
  const trimmed = String(text ?? "").trim();
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
 * Valide et normalise la réponse DeepSeek en Set d'indexes valides.
 * Exporté pour testabilité (fixtures, pas de réseau).
 * @param {unknown} parsed - objet JSON retourné par le modèle
 * @param {number} salesCount - nb de ventes envoyées (borne des indexes)
 * @returns {Set<number> | null} null si le format est inutilisable
 */
export function parseMatchResponse(parsed, salesCount) {
  if (!parsed || typeof parsed !== "object") return null;
  const raw = /** @type {{ matches?: unknown }} */ (parsed).matches;
  if (!Array.isArray(raw)) return null;
  const out = new Set();
  for (const v of raw) {
    const idx = Number(v);
    if (Number.isInteger(idx) && idx >= 0 && idx < salesCount) out.add(idx);
  }
  return out;
}

/**
 * Demande à DeepSeek quelles ventes 130point correspondent exactement à la
 * carte cible. Le matching LLM remplace le filtre regex (fingerprint) comme
 * filtre principal — les titres eBay sont trop variés pour des regex.
 *
 * L'appelant (getSoldPriceStats) cache déjà le résultat final 24h, donc cet
 * appel n'est payé qu'une fois par carte/jour.
 *
 * @param {string} targetTitle - titre du listing eBay cible
 * @param {Array<{ title: string }>} sales - ventes 130point (max ~40 utilisées)
 * @returns {Promise<{ ok: true; matchedIndexes: Set<number> } | { ok: false; error: string }>}
 */
export async function matchCompsWithAI(targetTitle, sales) {
  const apiKey = getDeepseekApiKey();
  if (!apiKey) return { ok: false, error: "DEEPSEEK_API_KEY manquante" };

  const target = String(targetTitle ?? "").trim();
  if (!target) return { ok: false, error: "Titre cible vide" };

  const batch = (Array.isArray(sales) ? sales : [])
    .slice(0, COMP_MATCH_BATCH_MAX)
    .map((s, i) => ({ index: i, title: String(s?.title ?? "").slice(0, 160) }));
  if (batch.length === 0) return { ok: true, matchedIndexes: new Set() };

  const userBlock = [
    `CARTE CIBLE : ${target.slice(0, 200)}`,
    "",
    "VENTES (JSON) :",
    JSON.stringify(batch, null, 2),
  ].join("\n");

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 1024,
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
      return { ok: false, error: `DeepSeek ${res.status}: ${raw.slice(0, 200)}` };
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Réponse DeepSeek illisible" };
    }

    const content = parsedBody?.choices?.[0]?.message?.content ?? "";
    const matched = parseMatchResponse(extractJsonObject(content), batch.length);
    if (matched === null) {
      return { ok: false, error: "Format de matching inattendu" };
    }
    return { ok: true, matchedIndexes: matched };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur réseau DeepSeek",
    };
  }
}
