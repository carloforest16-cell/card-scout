import "server-only";

import { assignDealRanks, matchesCardMode, parseCardMode } from "@/lib/dealFinder";
import { resolveEbayBearerToken } from "@/lib/ebayServer";
import { getInvestmentCandidatePlayers } from "@/lib/opportunityPool";
import { scanPlayerInvestments } from "@/lib/opportunityScan";
import { runInBackground } from "@/lib/backgroundTask";
import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { ELITE_PLAYER_IDS } from "@/lib/trendingData";

// Cap d'affichage de la vitrine « Meilleurs investissements ».
export const HOTTEST_MAX_CARDS = 24;

export const HOTTEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Score d'investissement plancher pour entrer dans la vitrine.
const MIN_HOTTEST_DEAL_SCORE = 6.5;
// Bassin de joueurs scannés (top scores full — le CM Score encode l'upside).
const POOL_LIMIT = 120;
// Concurrence du scan eBay (borne pour ne pas saturer l'API).
const SCAN_CONCURRENCY = 6;

/** @type {Record<"raw" | "graded", string>} */
// v6 : ajout des métadonnées joueur (teamAbbrev, âge, saisons, stade de
// carrière) consommées par les filtres de /deals. Les payloads v5 ne les ont
// pas — bump obligatoire, sinon le filtre « stade » ne matcherait rien tant que
// le cache 6h n'a pas tourné.
// v7 (PLAN-HOTTEST-DEALS.md) : cotes recalculées (variantes YG distinctes B1,
// repli broad neutralisé B2, jamais « Acheter » sans cote B4) + nouveaux champs
// serveur isTopDeal/rank/topDealReason (B10) + referenceValueCad (B2). Sans ce
// bump, 6 h de cache v6 serviraient les anciennes cotes faussées aux nouveaux
// composants.
const BLOB_CACHE_PATHNAMES = {
  raw: "hottest-deals-raw-cache-v9.json",
  graded: "hottest-deals-graded-cache-v9.json",
};

/**
 * Stade de carrière — l'axe qui compte pour l'investissement en cartes : une
 * recrue et un vétéran n'ont pas la même courbe de valeur.
 *
 * Renvoie `null` si l'âge ET le nombre de saisons manquent : une carte au stade
 * inconnu ne doit jamais être rangée arbitrairement dans un bucket (guardrail
 * « jamais de fausse donnée présentée comme vraie »). Elle sera simplement
 * exclue quand un filtre de stade précis est actif.
 *
 * @param {{ ageYears?: number | null; nhlSeasons?: number | null }} payload
 * @returns {"rookie" | "young" | "established" | "veteran" | null}
 */
export function resolveCareerStage(payload) {
  const seasons = Number(payload?.nhlSeasons);
  const age = Number(payload?.ageYears);
  const hasSeasons = Number.isFinite(seasons);
  const hasAge = Number.isFinite(age);

  if (!hasSeasons && !hasAge) return null;
  if (hasSeasons && seasons <= 1) return "rookie";
  if (hasAge && age <= 23) return "young";
  if (hasAge && age >= 30) return "veteran";
  if (hasAge) return "established";
  // Saisons connues sans âge : au-delà de la recrue on ne peut pas trancher
  // entre « établi » et « vétéran » sans inventer.
  return seasons >= 10 ? "veteran" : "established";
}

/** @type {Map<"raw" | "graded", { fetchedAt: number; payload: object | null }>} */
const hottestMemoryCacheByMode = new Map();

/**
 * @param {"raw" | "graded" | string} cardMode
 * @returns {"raw" | "graded"}
 */
function resolveMode(cardMode) {
  return parseCardMode(cardMode);
}

/**
 * @param {"raw" | "graded"} mode
 */
function getMemoryCacheEntry(mode) {
  return hottestMemoryCacheByMode.get(mode) ?? { fetchedAt: 0, payload: null };
}

/**
 * @param {"raw" | "graded"} mode
 * @param {{ fetchedAt: number; payload: object }} entry
 */
function setMemoryCacheEntry(mode, entry) {
  hottestMemoryCacheByMode.set(mode, entry);
}

/**
 * @param {number} fetchedAt
 */
function isCacheEntryFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < HOTTEST_CACHE_TTL_MS;
}

/**
 * @param {"raw" | "graded"} mode
 * @returns {Promise<{ fetchedAt: number; payload: object } | null>}
 */
async function readHottestCacheFromBlob(mode) {
  const pathname = BLOB_CACHE_PATHNAMES[mode];
  try {
    const parsed = await readJsonCache(pathname);
    const fetchedAt = Number(parsed?.fetchedAt);
    const payload = parsed?.payload;
    if (!payload || !isCacheEntryFresh(fetchedAt)) return null;
    return { fetchedAt, payload };
  } catch {
    return null;
  }
}

/** Cache expiré mais utilisable (stale-while-revalidate). */
async function readStaleHottestCache(mode) {
  const memoryEntry = getMemoryCacheEntry(mode);
  if (memoryEntry.payload) return memoryEntry;

  const pathname = BLOB_CACHE_PATHNAMES[mode];
  try {
    const parsed = await readJsonCache(pathname);
    const fetchedAt = Number(parsed?.fetchedAt);
    const payload = parsed?.payload;
    if (!payload) return null;
    const entry = { fetchedAt, payload };
    setMemoryCacheEntry(mode, entry);
    return entry;
  } catch {
    return null;
  }
}

/**
 * Lecture pure du cache hottest deals — jamais de fetch eBay, jamais
 * d'écriture. Retourne le cache frais s'il existe, sinon le cache périmé
 * (mieux qu'une page vide), sinon null. Pour des appelants qui veulent
 * croiser des données sans jamais déclencher de coût réseau (ex. dashboard).
 * @param {"raw" | "graded" | string} [cardMode]
 * @returns {Promise<{ cards: object[]; fetchedAt: number } | null>}
 */
export async function readHottestCacheOnly(cardMode = "raw") {
  const mode = resolveMode(cardMode);
  const blobEntry = await readHottestCacheFromBlob(mode);
  if (blobEntry) return { ...blobEntry.payload, fetchedAt: blobEntry.fetchedAt };
  const staleEntry = await readStaleHottestCache(mode);
  if (staleEntry) return { ...staleEntry.payload, fetchedAt: staleEntry.fetchedAt };
  return null;
}

/**
 * @param {"raw" | "graded"} mode
 * @param {{ fetchedAt: number; payload: object }} entry
 */
async function writeHottestCacheToBlob(mode, entry) {
  const pathname = BLOB_CACHE_PATHNAMES[mode];
  await writeJsonCache(pathname, entry);
}

/**
 * Démo sans eBay : cartes fictives triées par % marché pour remplir la section.
 * @param {"raw" | "graded"} cardMode
 * @returns {Array<object>}
 */
function buildMockHottestCards(cardMode) {
  const mode = resolveMode(cardMode);
  const labels = [
    "Connor McDavid",
    "Sidney Crosby",
    "Nathan MacKinnon",
    "Leon Draisaitl",
    "Cole Caufield",
    "Brad Marchand",
    "Auston Matthews",
    "Artemi Panarin",
    "David Pastrnak",
    "Nikita Kucherov",
    "Jack Hughes",
    "Quinn Hughes",
  ];
  const sorted = labels
    .slice(0, HOTTEST_MAX_CARDS)
    .map((playerName, i) => ({
      listingIndex: i,
      title:
        mode === "graded"
          ? `${playerName} Young Guns RC PSA 10 Gem Mint (exemple démo)`
          : `${playerName}  -  Young Guns RC (exemple démo)`,
      price: 72 + i * 4,
      percentOfMarket: 68 + i * 2.5,
      dealDeltaPct: 68 + i * 2.5 - 100,
      url: "https://www.ebay.ca",
      imageUrl: null,
      groupType: "â­ Young Guns",
      marketPrice: 95 + i * 5,
      priceConfidence: "high",
      investmentScore: 8 + (i % 6) * 0.2,
      cardScoutScore: 8 + (i % 6) * 0.2,
      holdTimeline: "2-3 saisons",
      upside: "Fort",
      verdict: "Acheter",
      reason: "Démo  -  branche eBay + DeepSeek pour du live.",
      scoreSource: "demo",
      playerName,
      playerId: String(ELITE_PLAYER_IDS[i] ?? i),
    }))
    .sort((a, b) => Number(a.percentOfMarket) - Number(b.percentOfMarket));
  return assignDealRanks(sorted);
}

/**
 * Moteur « Meilleurs investissements » (PLAN-OPPORTUNITY-ENGINE.md) : scanne un
 * large bassin de joueurs de qualité, ne garde que les cartes de TYPE qui
 * s'apprécie, à cote active fiable et au prix du marché ou en dessous (jamais
 * surpayées), triées par potentiel d'investissement (qualité joueur × type ×
 * prix). Remplace l'ancien scrape de 40 gros noms. Coût maîtrisé : scoring
 * heuristique (pas de DeepSeek en masse).
 * @param {"raw" | "graded" | string} [cardMode]
 * @returns {Promise<{ mocked: boolean; cards: object[]; playersResolved?: number; cardMode: "raw" | "graded" }>}
 */
async function buildHottestDealsFresh(cardMode = "raw") {
  const mode = resolveMode(cardMode);
  const token = await resolveEbayBearerToken();
  if (!token) {
    return {
      mocked: true,
      cards: buildMockHottestCards(mode),
      playersResolved: ELITE_PLAYER_IDS.length,
      cardMode: mode,
    };
  }

  const marketplaceId = process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";
  const players = await getInvestmentCandidatePlayers({ limit: POOL_LIMIT });

  // Scan par lots (concurrence bornée) pour ne pas saturer l'API eBay.
  const perPlayer = [];
  for (let i = 0; i < players.length; i += SCAN_CONCURRENCY) {
    const chunk = players.slice(i, i + SCAN_CONCURRENCY);
    const scanned = await Promise.all(
      chunk.map((p) => scanPlayerInvestments(p, token, marketplaceId))
    );
    perPlayer.push(...scanned);
  }

  const merged = perPlayer.flat();

  // Ne garde que des investissements dignes : type qui s'apprécie (déjà filtré
  // au scan) + score plancher + verdict pas « Passer » + respect du mode
  // (raw vs gradé). La cote fiable et la bande de prix sont déjà garanties amont.
  const picks = merged.filter(
    (c) =>
      Number(c.investmentScore) >= MIN_HOTTEST_DEAL_SCORE &&
      !String(c.verdict ?? "").toLowerCase().includes("passer") &&
      matchesCardMode(c.title, mode)
  );

  // Classement par potentiel d'investissement (le meilleur achat en tête), pas
  // par taille du rabais — un excellent joueur + carte qui monte au prix du
  // marché vaut mieux qu'un rabais sur une carte médiocre.
  const sorted = picks.sort(
    (a, b) => Number(b.investmentScore) - Number(a.investmentScore)
  );

  // Diversité : max 2 cartes par joueur.
  const perPlayerCount = new Map();
  const cards = [];
  for (const c of sorted) {
    if (cards.length >= HOTTEST_MAX_CARDS) break;
    const key = String(c.playerId ?? c.playerName);
    const n = perPlayerCount.get(key) ?? 0;
    if (n >= 2) continue;
    perPlayerCount.set(key, n + 1);
    cards.push(c);
  }

  // Rang « MEILLEUR CHOIX » = plus haut potentiel d'investissement de la vitrine
  // (top 1) ; top 3 marqués. Basé sur le score, pas le rabais.
  cards.forEach((c, i) => {
    delete c.isTopDeal;
    delete c.rank;
    delete c.topDealReason;
    if (i < 3) c.rank = i + 1;
    if (i === 0) {
      c.isTopDeal = true;
      c.topDealReason =
        c.dealDeltaPct != null && c.dealDeltaPct <= -5
          ? `${Math.round(Number(c.fairValueCad) - Number(c.price))} $ sous le marché`
          : "meilleur potentiel du jour";
    }
  });

  return {
    mocked: false,
    cards,
    playersResolved: players.length,
    cardMode: mode,
  };
}

/**
 * Hottest deals avec cache Blob (6 h) + mémoire process, séparé par mode.
 * @param {{ forceRefresh?: boolean; cardMode?: string; mode?: string }} [options]
 * @returns {Promise<{ ok: true; mocked: boolean; cards: object[]; playersResolved?: number; cardMode?: "raw" | "graded" }>}
 */
/** @type {Set<string>} */
const hottestRebuildInFlight = new Set();

/**
 * @param {"raw" | "graded"} mode
 */
function scheduleHottestBackgroundRebuild(mode) {
  if (hottestRebuildInFlight.has(mode)) return;
  hottestRebuildInFlight.add(mode);
  runInBackground(async () => {
    try {
      const fresh = await buildHottestDealsFresh(mode);
      const entry = { fetchedAt: Date.now(), payload: fresh };
      setMemoryCacheEntry(mode, entry);
      await writeHottestCacheToBlob(mode, entry);
    } finally {
      hottestRebuildInFlight.delete(mode);
    }
  });
}

export async function buildHottestDealsPayload(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const mode = resolveMode(options.cardMode ?? options.mode);

  if (!forceRefresh) {
    const blobEntry = await readHottestCacheFromBlob(mode);
    if (blobEntry) {
      setMemoryCacheEntry(mode, blobEntry);
      return { ok: true, ...blobEntry.payload, fetchedAt: blobEntry.fetchedAt };
    }

    const memoryEntry = getMemoryCacheEntry(mode);
    if (memoryEntry.payload && isCacheEntryFresh(memoryEntry.fetchedAt)) {
      return { ok: true, ...memoryEntry.payload, fetchedAt: memoryEntry.fetchedAt };
    }

    // Cache périmé (mémoire ou disque) → réponse immédiate + refresh background
    const staleEntry = await readStaleHottestCache(mode);
    if (staleEntry?.payload) {
      scheduleHottestBackgroundRebuild(mode);
      return { ok: true, ...staleEntry.payload, fetchedAt: staleEntry.fetchedAt };
    }
  }

  const now = Date.now();
  const fresh = await buildHottestDealsFresh(mode);
  const entry = { fetchedAt: now, payload: fresh };
  setMemoryCacheEntry(mode, entry);
  await writeHottestCacheToBlob(mode, entry);
  return { ok: true, ...fresh, fetchedAt: now };
}
