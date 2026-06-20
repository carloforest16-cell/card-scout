import "server-only";

import { getDeepseekApiKey } from "@/lib/deepseekKey";
import { toAffiliateUrl } from "@/lib/ebayAffiliate";
import {
  buildScorePayloadFromLanding,
  scoreCardScoutWithClaude,
} from "@/lib/cardScoutScore";
import {
  detectCardGroup,
  getEbayMedianAndCountForPlayer,
  realisticMedian,
} from "@/lib/dealFinder";
import {
  fetchEbayItemByLegacyId,
  listingPriceToCad,
  resolveEbayBearerToken,
} from "@/lib/ebayServer";
import { fetchPlayerLanding } from "@/lib/nhlPlayerLanding";

const NHL_PLAYER_SEARCH = "https://search.d3.nhle.com/api/v1/search/player";
const EBAY_SEARCH = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const DEEPSEEK_MODEL = "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/** Types de cartes premium qui s'apprécient davantage. */
const PREMIUM_GROUPS = /Gradée|Auto|RPA|Young Guns|Numéroté|Cup|Clear Cut|Patch/i;

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

/** Mots de jargon de carte à exclure des candidats de noms de joueur. */
const CARD_JARGON = new Set([
  "series", "young", "guns", "renewed", "rookie", "near", "mint", "condition",
  "upper", "deck", "opc", "auto", "autograph", "autographs", "signed", "canvas",
  "gold", "silver", "platinum", "ice", "artifacts", "trilogy", "premier",
  "exclusives", "retro", "parallel", "patch", "relic", "cup", "fleer", "ultra",
  "tim", "hortons", "black", "diamond", "game", "used", "spx", "mvp", "allure",
  "credentials", "outburst", "dazzlers", "seismic", "ultimate", "tribute",
  "display", "tribute", "rainbow", "refractor", "holo", "prizm", "mosaic",
  "select", "chronology", "extended", "future", "watch", "acetate", "clear",
  "cut", "national", "hockey", "card", "cards", "the", "psa", "bgs", "sgc",
  "cgc", "gem", "low", "pop", "case", "hit", "sp", "rc", "nm",
]);

/**
 * Candidats de noms de joueur dans un titre : séquences de 2+ mots capitalisés
 * qui ne sont pas du jargon de carte. Gère le nom où qu'il soit (début/milieu).
 * @param {string} title
 * @returns {string[]}
 */
function nameCandidates(title) {
  const words = String(title ?? "").split(/\s+/);
  const out = [];
  let run = [];
  for (const w of words) {
    const clean = w.replace(/[^A-Za-z'-]/g, "");
    const isName =
      /^[A-Z][a-zA-Z'-]+$/.test(clean) &&
      clean.length >= 2 &&
      !CARD_JARGON.has(clean.toLowerCase());
    if (isName) {
      run.push(clean);
    } else {
      if (run.length >= 2) out.push(run.join(" "));
      run = [];
    }
  }
  if (run.length >= 2) out.push(run.join(" "));
  // Noms complets (plus longs) d'abord.
  return [...new Set(out)].sort((a, b) => b.length - a.length);
}

/** Détecte le grade (PSA/BGS/SGC…) directement dans le titre. */
function detectGradeFromTitle(title) {
  const m = String(title ?? "").match(
    /\b(PSA|BGS|SGC|CGC|CSG)\s*(10|9\.5|9|8\.5|8)\b/i
  );
  return m ? `${m[1].toUpperCase()} ${m[2]}` : null;
}

const TEAM_NOISE =
  /\b(montreal|canadiens|toronto|maple|leafs|boston|bruins|edmonton|oilers|calgary|flames|vancouver|canucks|ottawa|senators|winnipeg|jets|buffalo|sabres|chicago|blackhawks|detroit|red\s*wings|minnesota|wild|colorado|avalanche|dallas|stars|st\.?\s*louis|blues|nashville|predators|columbus|blue\s*jackets|florida|panthers|tampa|bay|lightning|washington|capitals|philadelphia|flyers|pittsburgh|penguins|new\s*jersey|devils|islanders|rangers|carolina|hurricanes|seattle|kraken|vegas|golden\s*knights|anaheim|ducks|los\s*angeles|kings|san\s*jose|sharks|arizona|utah|coyotes)\b/gi;

/**
 * Requête eBay ciblée pour des comparables de CETTE carte : on retire les
 * numéros de carte et noms d'équipe (trop spécifiques) mais on garde
 * année + set + parallèle + joueur + grade.
 */
function buildComparableQuery(title) {
  return String(title ?? "")
    .replace(/#\s*[A-Za-z]*-?\d+/g, " ")
    .replace(TEAM_NOISE, " ")
    .replace(/\b(mint|gem|near|nm|card|cards|hockey|sports?|trading|the)\b/gi, " ")
    .replace(/[^\w\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

/**
 * Cherche un joueur NHL ; retourne le meilleur match (nom dans le titre, actif).
 */
async function resolvePlayer(query, title) {
  const q = String(query ?? "").trim();
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
      const nameLower = name.toLowerCase();
      const tokens = nameLower.split(/\s+/).filter(Boolean);
      // Tokens UNIQUES — « Ivan Ivan » ne compte qu'un seul token distinct,
      // sinon il « match » trivialement n'importe quel titre contenant « ivan ».
      const distinct = new Set(tokens.filter((t) => titleLower.includes(t)));
      // Bonus fort si le nom complet apparaît tel quel, plus faible pour le
      // seul nom de famille — départage les homonymes avec premier prénom commun.
      const fullMatch = titleLower.includes(nameLower) ? 100 : 0;
      const lastName = tokens[tokens.length - 1];
      const lastMatch = lastName && titleLower.includes(lastName) ? 10 : 0;
      const score = fullMatch + lastMatch + distinct.size;
      return {
        playerId: String(r.playerId),
        name,
        active: r.teamAbbrev != null,
        inTitle: distinct.size,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || Number(b.active) - Number(a.active));
  return scored[0] ?? null;
}

/**
 * Recherche eBay générique (port inclus). Exclut l'annonce analysée.
 * @returns {Promise<Array<{ title: string; priceCad: number; url: string | null }>>}
 */
async function fetchComparables(query, excludeId) {
  const token = await resolveEbayBearerToken();
  if (!token || !query) return [];
  const mp = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";
  const url = new URL(EBAY_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "50");

  let res;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": mp,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  let data;
  try {
    data = await res.json();
  } catch {
    return [];
  }
  const items = Array.isArray(data?.itemSummaries) ? data.itemSummaries : [];
  const out = [];
  for (const it of items) {
    if (excludeId && String(it?.legacyItemId ?? "") === String(excludeId)) continue;
    const cur = it?.price?.currency;
    const base = listingPriceToCad(it?.price?.value, cur);
    if (base == null) continue;
    let ship = 0;
    const opt = Array.isArray(it?.shippingOptions) ? it.shippingOptions[0] : null;
    if (opt?.shippingCost?.value != null) {
      const s = listingPriceToCad(opt.shippingCost.value, opt.shippingCost.currency ?? cur);
      if (s != null) ship = s;
    }
    out.push({
      title: typeof it?.title === "string" ? it.title : "",
      priceCad: Math.round((base + ship) * 100) / 100,
      shippingCad: Math.round(ship * 100) / 100,
      url: toAffiliateUrl(it?.itemWebUrl) ?? null,
    });
  }
  return out;
}

/**
 * Projection de prix sur 5 ans (modèle transparent : croissance annuelle dérivée
 * de la qualité joueur, jeunesse, momentum, désirabilité du type, gradation).
 */
function computeProjection(base, { score, ageFactor, momentumFactor, group, grade }) {
  if (!Number.isFinite(base) || base <= 0) return null;

  let g = 0.02; // marché de base ~2%/an
  if (Number.isFinite(score)) g += (score - 5) * 0.018; // qualité joueur
  if (Number.isFinite(ageFactor)) g += (ageFactor - 5) * 0.008; // jeunesse = runway
  if (Number.isFinite(momentumFactor)) g += (momentumFactor - 5) * 0.005;
  if (PREMIUM_GROUPS.test(String(group ?? ""))) g += 0.03; // type désirable
  if (grade) g += 0.015; // gradée = liquidité
  g = Math.max(-0.08, Math.min(0.22, g));

  const now = new Date().getFullYear();
  const points = [];
  for (let y = 0; y <= 5; y++) {
    points.push({
      year: now + y,
      low: Math.round(base * Math.pow(1 + Math.max(-0.12, g - 0.08), y)),
      mid: Math.round(base * Math.pow(1 + g, y)),
      high: Math.round(base * Math.pow(1 + g + 0.06, y)),
    });
  }
  return { annualGrowthPct: Math.round(g * 1000) / 10, points };
}

/** Verdict holistique IA. */
async function aiVerdict(facts) {
  const apiKey = getDeepseekApiKey();
  if (!apiKey) return null;
  const system = `Tu es un expert en investissement de cartes de hockey NHL.
On te donne une annonce eBay déjà analysée (joueur, type de carte, grade, prix total port inclus, juste-valeur de marché par comparables, alternatives moins chères).
Donne un verdict d'achat synthétique, honnête et actionnable.
Réponds UNIQUEMENT en JSON valide (guillemets doubles) :
{
  "verdict": "Acheter" | "Chercher mieux" | "Passer",
  "priceVerdict": "une phrase: le prix est-il juste vs la cote du marché",
  "playerVerdict": "une phrase: le joueur comme investissement long terme",
  "cardVerdict": "une phrase: la désirabilité du type de carte ET du grade",
  "summary": "2 phrases max: recommandation globale et le pourquoi"
}`;

  let text = "";
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        max_tokens: 500,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(facts, null, 2) },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    text = data?.choices?.[0]?.message?.content ?? "";
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
 * Analyse complète d'une annonce eBay.
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

  const group = detectCardGroup(item.title);
  const grade = detectGradeFromTitle(item.title);
  const yearMatch = item.title.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;

  // Joueur : caractéristique « Player » d'eBay d'abord (fiable), sinon candidats
  // de noms extraits du titre (gère le nom en milieu de titre, ex. Young Guns).
  let player = null;
  if (item.playerHint) {
    player = await resolvePlayer(item.playerHint, `${item.title} ${item.playerHint}`);
  }
  if (!player || player.inTitle < 1) {
    for (const cand of nameCandidates(item.title)) {
      const match = await resolvePlayer(cand, item.title);
      if (match && match.inTitle >= 2) {
        player = match;
        break;
      }
    }
  }

  // 1) Score joueur (réutilise le moteur Card Scout, caché).
  let cardScout = null;
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
          reasoning: scored.reasoning,
        };
      } else if (scored?.factors) {
        // Fallback : IA indisponible mais on a le score mathématique
        const mathScore = Number(scored.factors?.weightedScore);
        const composite = Number.isFinite(mathScore) ? Math.round(mathScore * 10) / 10 : null;
        cardScout = {
          score: composite,
          verdict: null,
          factors: scored.factors,
          reasoning: null,
          mathOnly: true,
        };
      }
    }
  }

  // 2) Juste-valeur via recherche eBay CIBLÉE sur cette carte exacte, filtrée
  //    par type (et grade si gradée) pour ne pas mélanger les variantes.
  let fairValue = null;
  let alternatives = [];

  // Comparables eBay actifs → alternatives moins chères (+ fallback de cote).
  const query = buildComparableQuery(item.title);
  const comps = await fetchComparables(query, itemId);
  const matched = comps.filter((c) => {
    if (group && detectCardGroup(c.title) !== group) return false;
    if (grade && detectGradeFromTitle(c.title) !== grade) return false;
    return true;
  });
  // Dual / checklist / multi-player = produit fondamentalement différent
  // (ex. « Levshunov, Demidov #250 » ≠ Young Guns solo). On ne mélange pas.
  // Séparateurs détectés : / & , et . Aussi : mot-clés explicites.
  const isDualCard = (t) => {
    const s = String(t ?? "");
    if (/\bchecklist\b|\bdual\b|\bduo\b|\btwo\s*player\b/i.test(s)) return true;
    // « Prénom Nom [sép] Prénom Nom » avec séparateur /, &, ,, +
    if (
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\s*[/&,+]\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/.test(s)
    )
      return true;
    return false;
  };

  // Annonces-lot où l'acheteur choisit la carte (le prix affiché est celui de
  // la carte la moins chère du lot, pas de la carte précise) : « You Pick »,
  // « Your Choice », « U-Pick », « Lot of », etc.
  const isPickLot = (t) => {
    const s = String(t ?? "");
    return (
      /\byou\s*pick\b|\byour\s*pick\b|\bpick\s*your\b|\byour\s*choice\b|\bu[\s-]?pick\b|\blot\s*of\b|\bchoose\b/i.test(s) ||
      // Packs scellés / boîtes / blasters : tirage aléatoire, pas la carte précise.
      /\b(?:sealed|unopened)\b.*\b(?:pack|packs|box|blaster|hobby|hanger|tin|fat|jumbo\s*pack)\b/i.test(s) ||
      /\b\d+\s*(?:sealed\s*)?(?:pack|packs)\b/i.test(s) ||
      // Listings « collection » / « bulk » / « 100 cards »
      /\b\d{2,}\s*cards?\b/i.test(s)
    );
  };

  // Variantes physiques distinctes : Jumbo (~4×6 po), Oversized, Box Topper,
  // 5×7, Blow-up, Tin. Même n° de carte mais SKU et valeur différents.
  const variantTag = (t) => {
    const s = String(t ?? "").toLowerCase();
    if (/\bjumbo\b|\boversized?\b|\bblow[\s-]?up\b/.test(s)) return "jumbo";
    if (/\bbox\s*topper\b/.test(s)) return "box-topper";
    if (/\b5\s*x\s*7\b/.test(s)) return "5x7";
    if (/\btin\b(?!\s*foil)/.test(s)) return "tin";
    return "standard";
  };

  const itemIsDual = isDualCard(item.title);
  const itemVariant = variantTag(item.title);
  alternatives = matched
    .filter(
      (c) =>
        c.priceCad < item.priceCad &&
        !isPickLot(c.title) &&
        isDualCard(c.title) === itemIsDual &&
        variantTag(c.title) === itemVariant
    )
    .sort((a, b) => a.priceCad - b.priceCad)
    .slice(0, 4);

  // Cote : médiane des annonces actives eBay (prix demandés — indicatif).
  if (matched.length >= 2) {
    const prices = matched.map((c) => c.priceCad).filter((p) => p > 0);
    const fair = Math.round(realisticMedian(prices) * 100) / 100;
    fairValue = {
      fairValueCad: fair,
      source: "ebay_active",
      comps: prices.length,
      confidence: prices.length >= 8 ? "high" : prices.length >= 4 ? "medium" : "low",
      deltaPct: Math.round(((item.priceCad - fair) / fair) * 100),
      trusted: prices.length >= 4,
    };
  }

  // 3) Projection de prix 5 ans.
  const projBase = fairValue?.fairValueCad ?? item.priceCad;
  const projection = computeProjection(projBase, {
    score: cardScout?.score,
    ageFactor: cardScout?.factors?.age?.score,
    momentumFactor: cardScout?.factors?.momentum?.score,
    group,
    grade,
  });

  // 4) Verdict IA holistique.
  const verdict = await aiVerdict({
    joueur: player?.name ?? "inconnu",
    cardScoutScore: cardScout?.score ?? null,
    cardScoutVerdict: cardScout?.verdict ?? null,
    typeDeCarte: group ?? "inconnu",
    grade: grade ?? "brut (non gradée)",
    annee: year,
    prixTotalCad: item.priceCad,
    justeValeurCad: fairValue?.trusted ? fairValue.fairValueCad : null,
    ecartPct: fairValue?.trusted ? fairValue.deltaPct : null,
    fiabiliteJusteValeur: fairValue
      ? fairValue.trusted
        ? "fiable"
        : "indicative (peu de comparables)"
      : "aucune donnée",
    nbAlternativesMoinsCheres: alternatives.length,
    croissanceAnnuelleEstimeePct: projection?.annualGrowthPct ?? null,
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
    card: { group, grade, year },
    player: player ? { id: player.playerId, name: player.name } : null,
    cardScout,
    fairValue,
    alternatives,
    projection,
    verdict,
  };
}
