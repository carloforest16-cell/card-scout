import "server-only";

import {
  buildScorePayloadFromLanding,
  computeFactorScores,
} from "@/lib/cardScoutScore";
import {
  buildInvestmentIntelligenceFromListings,
  fetchEbayHockeyCardListingsForPlayer,
  parseCardMode,
} from "@/lib/dealFinder";
import { resolveEbayBearerToken } from "@/lib/ebayServer";
import { fetchPlayerLanding, resolveFullName } from "@/lib/nhlPlayerLanding";
import { runInBackground } from "@/lib/backgroundTask";
import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { TRENDING_PLAYER_IDS } from "@/lib/trendingData";

export const HOTTEST_MAX_CARDS = 12;

export const HOTTEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MIN_HOTTEST_INVESTMENT_SCORE = 5.0;
const CARD_SCOUT_SCORE_CONCURRENCY = 5;

/** @type {Record<"raw" | "graded", string>} */
const BLOB_CACHE_PATHNAMES = {
  raw: "hottest-deals-raw-cache-v5.json",
  graded: "hottest-deals-graded-cache-v5.json",
};

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
  return labels
    .slice(0, HOTTEST_MAX_CARDS)
    .map((playerName, i) => ({
      listingIndex: i,
      title:
        mode === "graded"
          ? `${playerName} Young Guns RC PSA 10 Gem Mint (exemple démo)`
          : `${playerName}  -  Young Guns RC (exemple démo)`,
      price: 72 + i * 4,
      percentOfMarket: 68 + i * 2.5,
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
      playerId: String(TRENDING_PLAYER_IDS[i] ?? i),
    }))
    .sort((a, b) => Number(a.percentOfMarket) - Number(b.percentOfMarket));
}

/**
 * @param {{ id: string; playerName: string; landing: object }} player
 * @returns {Promise<number | null>}
 */
async function resolveCardScoutScoreForPlayer(player) {
  const scorePayload = buildScorePayloadFromLanding(player.id, player.landing);

  // Score mathématique uniquement (pas de Claude, pas d'eBay ici) : le fetch
  // eBay arrive juste après pour les listings — évite un 2e appel eBay/joueur.
  const { weightedScore } = computeFactorScores(scorePayload, null, null, null);
  return Math.round(Math.min(10, Math.max(0, weightedScore)) * 10) / 10;
}

/**
 * @param {Array<{ id: string; playerName: string; landing: object }>} players
 * @returns {Promise<Map<string, number>>}
 */
async function buildCardScoutScoreByPlayerId(players) {
  /** @type {Map<string, number>} */
  const scoresById = new Map();

  for (let i = 0; i < players.length; i += CARD_SCOUT_SCORE_CONCURRENCY) {
    const chunk = players.slice(i, i + CARD_SCOUT_SCORE_CONCURRENCY);
    const scored = await Promise.all(
      chunk.map(async (player) => {
        const score = await resolveCardScoutScoreForPlayer(player);
        return { id: player.id, score };
      })
    );
    for (const { id, score } of scored) {
      if (Number.isFinite(Number(score))) {
        scoresById.set(id, Number(score));
      }
    }
  }

  return scoresById;
}

/**
 * Agrège les stars NHL : eBay + scores en parallèle, top 12 par % marché croissant.
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
      playersResolved: TRENDING_PLAYER_IDS.length,
      cardMode: mode,
    };
  }

  const marketplaceId =
    process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const rows = await Promise.all(
    TRENDING_PLAYER_IDS.map(async (id) => {
      const data = await fetchPlayerLanding(id);
      if (!data) return null;
      const playerName = resolveFullName(data).trim();
      if (!playerName) return null;
      return { id: String(id), playerName, landing: data };
    })
  );
  const players = rows.filter(Boolean);
  const cardScoutScoreByPlayerId =
    await buildCardScoutScoreByPlayerId(players);

  const perPlayer = await Promise.all(
    players.map(async (p) => {
      const ebay = await fetchEbayHockeyCardListingsForPlayer(
        p.playerName,
        token,
        marketplaceId
      );
      if (!ebay.ok || !ebay.listings.length) return [];
      const cardScoutScore = cardScoutScoreByPlayerId.get(p.id) ?? null;
      // Scoring heuristique (mocked=true → pas de Claude) : rapide et fiable
      // pour l'agrégat ; l'analyse Claude profonde reste sur la recherche joueur.
      // On passe le Card Metrics Score du joueur comme contexte pour que le
      // scoring plafonne les cartes des joueurs faibles (pas de "Acheter Fort"
      // à 8.7 pour un inconnu sur une carte simplement bon marché).
      const intel = await buildInvestmentIntelligenceFromListings(
        p.playerName,
        ebay.listings,
        ebay.totalListings,
        true,
        mode,
        true,
        cardScoutScore != null ? { cardMetricsScore: cardScoutScore } : null
      );
      if (!intel.ok || !intel.data?.listings?.length) return [];
      // Validation du nom : la recherche floue eBay renvoie parfois la carte
      // d'un AUTRE joueur (ex. un auto d'un inconnu sur une recherche star) —
      // elle s'afficherait alors avec le Card Metrics Score de la star (faux).
      const lastName = p.playerName.split(/\s+/).pop()?.toLowerCase() ?? "";
      return intel.data.listings
        .filter(
          (L) =>
            lastName.length < 3 ||
            String(L.title ?? "").toLowerCase().includes(lastName)
        )
        .map((L) => ({
          ...L,
          playerName: p.playerName,
          playerId: p.id,
          cardScoutScore,
        }));
    })
  );

  const merged = perPlayer.flat();

  // Les cartes viennent déjà filtrées "Acheter" par le pipeline. Le Card Metrics
  // Score du joueur peut ne pas s'être résolu (échec/timeout Claude) → on garde
  // quand même la carte plutôt que de vider la section.
  const filtered = merged.filter((c) => {
    const s = Number(c.cardScoutScore);
    return !Number.isFinite(s) || s >= MIN_HOTTEST_INVESTMENT_SCORE;
  });
  const sorted = filtered.sort(
    (a, b) => Number(b.investmentScore) - Number(a.investmentScore)
  );
  // Diversité : max 2 cartes par joueur, sinon un seul joueur monopolise le top
  // (l'audit voyait 2× Ceulemans + 2× McAvoy + 2× Raymond sur 12).
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
