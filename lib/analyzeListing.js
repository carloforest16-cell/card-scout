import "server-only";

import { extractCardFingerprint } from "@/lib/cardNumberExtractor";
import {
  buildScorePayloadFromLanding,
  scoreCardScoutWithClaude,
} from "@/lib/cardScoutScore";
import {
  cohortKeyForTitle,
  computeFairValueByFingerprint,
  detectCardGroup,
  fetchEbayHockeyCardListingsForPlayer,
  getEbayMedianAndCountForPlayer,
} from "@/lib/dealFinder";
import {
  fetchEbayItemByLegacyId,
  resolveEbayBearerToken,
} from "@/lib/ebayServer";
import { fetchPlayerLanding } from "@/lib/nhlPlayerLanding";

const NHL_PLAYER_SEARCH = "https://search.d3.nhle.com/api/v1/search/player";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Extrait l'ID legacy d'une URL eBay (/itm/123..., ?item=123, ou nombre brut).
 * @param {string} input
 * @returns {string | null}
 */
export function parseEbayItemId(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  const itm = s.match(/\/itm\/(?:[^/?#]+\/)?(\d{9,15})/);
  if (itm) return itm[1];
  const q = s.match(/[?&](?:item|itemId|legacy_item_id)=(\d{9,15})/i);
  if (q) return q[1];
  const bare = s.match(/^(\d{9,15})$/);
  if (bare) return bare[1];
  return null;
}

/**
 * Cherche un joueur NHL par nom ; retourne le meilleur match (nom présent dans
 * le titre, puis actif).
 * @param {string} lastName
 * @param {string} title
 */
async function resolvePlayer(lastName, title) {
  const q = String(lastName ?? "").trim();
  if (!q) return null;

  const url = new URL(NHL_PLAYER_SEARCH);
  url.searchParams.set("q", q);
  url.searchParams.set("culture", "en");
  url.searchParams.set("limit", "20");

  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "CardScout/1.0" },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let data;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data.length === 0) return null;

  const titleLower = String(title ?? "").toLowerCase();
  const scored = data
    .filter((r) => r?.playerId != null && r?.name)
    .map((r) => {
      const name = String(r.name);
      const tokens = name.toLowerCase().split(/\s+/).filter(Boolean);
      const inTitle = tokens.filter((t) => titleLower.includes(t)).length;
      return {
        playerId: String(r.playerId),
        name,
        active: r.teamAbbrev != null,
        inTitle,
      };
    })
    .sort((a, b) => b.inTitle - a.inTitle || Number(b.active) - Number(a.active));

  return scored[0] ?? null;
}

/**
 * Verdict holistique Claude à partir des données déjà structurées.
 * @param {object} facts
 */
async function claudeVerdict(facts) {
  const apiKey = process.env.CS_CLAUDE_KEY;
  if (!apiKey) return null;

  const system = `Tu es un expert en investissement de cartes de hockey NHL.
On te donne une annonce eBay déjà analysée (joueur, type de carte, prix total port inclus, juste-valeur de marché par comparables, alternatives moins chères).
Donne un verdict d'achat synthétique, honnête et actionnable.
Réponds UNIQUEMENT en JSON valide (guillemets doubles) :
{
  "verdict": "Acheter" | "Surveiller" | "Passer",
  "priceVerdict": "une phrase: le prix est-il juste vs la cote du marché",
  "playerVerdict": "une phrase: le joueur comme investissement long terme",
  "cardVerdict": "une phrase: la désirabilité du type de carte",
  "summary": "2 phrases max: recommandation globale et le pourquoi"
}`;

  let text = "";
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
        max_tokens: 500,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: JSON.stringify(facts, null, 2) }],
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    text = data?.content?.find((b) => b?.type === "text")?.text ?? "";
  } catch {
    return null;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Analyse complète d'une annonce eBay : carte, joueur, juste-valeur,
 * alternatives moins chères, verdict IA.
 * @param {string} urlOrId
 */
export async function analyzeEbayListing(urlOrId) {
  const itemId = parseEbayItemId(urlOrId);
  if (!itemId) {
    return {
      ok: false,
      error:
        "URL eBay invalide. Colle un lien d'annonce du type ebay.ca/itm/123456789012.",
    };
  }

  const item = await fetchEbayItemByLegacyId(itemId);
  if (!item || !item.title) {
    return {
      ok: false,
      error: "Annonce introuvable sur eBay (expirée, vendue, ou ID invalide ?).",
    };
  }

  const fp = extractCardFingerprint(item.title);
  const group = detectCardGroup(item.title);
  const cohortKey = cohortKeyForTitle(item.title);

  // Priorité à l'indice « Player » d'eBay (fiable même si le nom est en fin de
  // titre, ex. OPC Platinum), sinon le nom extrait du fingerprint.
  const playerQuery = item.playerHint || fp?.lastName || null;
  const player = playerQuery
    ? await resolvePlayer(playerQuery, `${item.title} ${item.playerHint ?? ""}`)
    : null;

  let cardScout = null;
  let fairValue = null;
  let alternatives = [];

  if (player) {
    const landing = await fetchPlayerLanding(player.playerId);
    if (landing) {
      const payload = buildScorePayloadFromLanding(player.playerId, landing);
      const { medianPriceCad, listingCount, dealGapPct } =
        await getEbayMedianAndCountForPlayer(player.name);
      const scored = await scoreCardScoutWithClaude(
        payload,
        medianPriceCad,
        listingCount,
        dealGapPct
      );
      if (scored?.ok) {
        cardScout = {
          score: scored.score,
          verdict: scored.verdict,
          factors: scored.factors,
        };
      }
    }

    const token = await resolveEbayBearerToken();
    if (token && cohortKey) {
      const mp = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";
      const ebay = await fetchEbayHockeyCardListingsForPlayer(
        player.name,
        token,
        mp
      );
      if (ebay?.ok && Array.isArray(ebay.listings)) {
        const fairMap = computeFairValueByFingerprint(ebay.listings);
        const fv = fairMap.get(cohortKey);
        if (fv?.fairValueCad != null) {
          const deltaPct = Math.round(
            ((item.priceCad - fv.fairValueCad) / fv.fairValueCad) * 100
          );
          fairValue = {
            fairValueCad: fv.fairValueCad,
            comps: fv.comps,
            confidence: fv.confidence,
            deltaPct,
            trusted: fv.comps >= 4,
          };
        }

        alternatives = ebay.listings
          .filter(
            (l) =>
              cohortKeyForTitle(l.title) === cohortKey &&
              Number(l.priceCad) > 0 &&
              Number(l.priceCad) < item.priceCad
          )
          .sort((a, b) => a.priceCad - b.priceCad)
          .slice(0, 4)
          .map((l) => ({
            title: l.title,
            priceCad: l.priceCad,
            url: l.url ?? null,
          }));
      }
    }
  }

  const verdict = await claudeVerdict({
    joueur: player?.name ?? "inconnu",
    cardScoutScore: cardScout?.score ?? null,
    cardScoutVerdict: cardScout?.verdict ?? null,
    typeDeCarte: group ?? "inconnu",
    grade: fp?.grade ?? "brut (raw)",
    annee: fp?.year ?? null,
    prixTotalCad: item.priceCad,
    justeValeurCad: fairValue?.trusted ? fairValue.fairValueCad : null,
    ecartPct: fairValue?.trusted ? fairValue.deltaPct : null,
    fiabiliteJusteValeur: fairValue
      ? fairValue.trusted
        ? "fiable"
        : "indicative (peu de comparables)"
      : "aucune donnée",
    nbAlternativesMoinsCheres: alternatives.length,
  });

  return {
    ok: true,
    listing: {
      title: item.title,
      priceCad: item.priceCad,
      shippingCad: item.shippingCad,
      imageUrl: item.imageUrl,
      condition: item.condition,
      url: item.url,
    },
    card: { group, grade: fp?.grade ?? null, year: fp?.year ?? null },
    player: player ? { id: player.playerId, name: player.name } : null,
    cardScout,
    fairValue,
    alternatives,
    verdict,
  };
}
