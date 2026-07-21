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
import { titleMatchesPlayer } from "@/lib/titleFilters";
import { resolveEbayBearerToken } from "@/lib/ebayServer";
import { fetchPlayerLanding, resolveFullName } from "@/lib/nhlPlayerLanding";
import { runInBackground } from "@/lib/backgroundTask";
import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { ELITE_PLAYER_IDS } from "@/lib/trendingData";

// 30 : signalé par Carlo 2026-07-18 (« juste 12 deals? impossible que ça
// cherche dans tout eBay »). La pool ELITE de 40 joueurs × ~15 listings scorés
// par joueur donne largement de quoi remplir 30 slots de qualité, la diversité
// max 2/joueur évite qu'un seul joueur monopolise.
export const HOTTEST_MAX_CARDS = 30;

export const HOTTEST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Vitrine « Hottest Deals » : la qualité des joueurs est garantie par le pool
// (ELITE_PLAYER_IDS — noms reconnaissables uniquement). On garde seulement un
// plancher sur le deal lui-même pour ne pas montrer de scores mous en tête
// d'une section qui s'appelle « Hottest ».
const MIN_HOTTEST_DEAL_SCORE = 6.5;
const CARD_SCOUT_SCORE_CONCURRENCY = 5;

/** @type {Record<"raw" | "graded", string>} */
// v6 : ajout des métadonnées joueur (teamAbbrev, âge, saisons, stade de
// carrière) consommées par les filtres de /deals. Les payloads v5 ne les ont
// pas — bump obligatoire, sinon le filtre « stade » ne matcherait rien tant que
// le cache 6h n'a pas tourné.
const BLOB_CACHE_PATHNAMES = {
  raw: "hottest-deals-raw-cache-v6.json",
  graded: "hottest-deals-graded-cache-v6.json",
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
      playerId: String(ELITE_PLAYER_IDS[i] ?? i),
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
      playersResolved: ELITE_PLAYER_IDS.length,
      cardMode: mode,
    };
  }

  const marketplaceId =
    process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_CA";

  const rows = await Promise.all(
    ELITE_PLAYER_IDS.map(async (id) => {
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
      // Validation du nom AVANT le scoring : la recherche floue eBay renvoie
      // parfois la carte d'un AUTRE joueur (elle s'afficherait avec le Card
      // Metrics Score de la star = faux). On filtre en amont pour ne pas scorer
      // ni polluer les cohortes de juste-valeur avec des cartes étrangères.
      // titleMatchesPlayer gère accents (Stützle↔Stutzle) et frères (source
      // partagée lib/titleFilters.js).
      const ownListings = ebay.listings.filter((L) =>
        titleMatchesPlayer(p.playerName, L.title)
      );
      if (!ownListings.length) return [];
      // Scoring DeepSeek (mocked=false) — comme une recherche directe. Avant, on
      // scorait à l'heuristique pure → les Hottest Deals plafonnaient à ~7.3 alors
      // qu'un utilisateur qui cherchait le même joueur voyait des 8.5 (bug de
      // parité signalé par Carlo 2026-07-16). On construit un contexte riche à
      // partir de p.landing (déjà en mémoire, aucun refetch NHL nécessaire).
      const payload = buildScorePayloadFromLanding(p.id, p.landing);
      const playerContext = {
        fullName: p.playerName,
        cardMetricsScore: cardScoutScore,
        ageYears: payload.ageYears,
        position: payload.position,
        teamAbbrev: payload.teamAbbrev,
        nhlSeasons: payload.nhlSeasons,
        draftOverall: payload.draftOverall,
        isRetired: payload.isRetired,
        pointsPerGame: payload.currentSeason?.pointsPerGame ?? null,
        gamesPlayed: payload.currentSeason?.gamesPlayed ?? null,
        goals: payload.currentSeason?.goals ?? null,
        assists: payload.currentSeason?.assists ?? null,
        seasonLabel: payload.currentSeason?.seasonLabel ?? null,
      };
      const intel = await buildInvestmentIntelligenceFromListings(
        p.playerName,
        ownListings,
        ebay.totalListings,
        false, // mocked=false → DeepSeek scoring (top 15 par joueur)
        mode,
        true,
        playerContext
      );
      if (!intel.ok || !intel.data?.listings?.length) return [];
      return intel.data.listings.map((L) => ({
        ...L,
        playerName: p.playerName,
        playerId: p.id,
        cardScoutScore,
        // Métadonnées joueur pour les filtres client (stade de carrière, équipe).
        // Elles viennent de p.landing, déjà en mémoire — aucun appel réseau
        // supplémentaire. `teamAbbrev` remplace la map codée en dur côté client,
        // qui faisait disparaître tout joueur absent de la liste.
        teamAbbrev: payload.teamAbbrev ?? null,
        playerAgeYears: payload.ageYears ?? null,
        playerSeasons: payload.nhlSeasons ?? null,
        playerStage: resolveCareerStage(payload),
      }));
    })
  );

  const merged = perPlayer.flat();

  // Plancher deal seulement — la pool ELITE_PLAYER_IDS garantit déjà la qualité
  // des joueurs. Un « Hottest » ne devrait jamais afficher un deal sous 6.5.
  const filtered = merged.filter(
    (c) => Number(c.investmentScore) >= MIN_HOTTEST_DEAL_SCORE
  );
  // Tri à deux niveaux (demandé par Carlo 2026-07-18, option B) : privilégier
  // la CONVERSION. Un « vrai deal » — cote fiable ET prix sous la cote — est
  // beaucoup plus cliquable qu'une carte rare à 1500 $ sans référence de prix.
  // Niveau 1 : deals actionnables (cote fiable + prix ≥ 5% sous la cote).
  // Niveau 2 : le reste (cartes rares sans cote, ou au prix du marché).
  // DANS chaque niveau, tri par investmentScore décroissant → les scores
  // restent en ordre décroissant à l'écran (ce que Carlo exige), et la raison
  // du classement est VISIBLE (le pill « −15 $ » explique pourquoi la carte est
  // plus haut). L'ancien tri hybride 60/40 avec le CM était invisible → semblait
  // aléatoire ; ici le signal est à l'écran.
  const isActionableDeal = (c) =>
    c.percentOfMarket != null &&
    c.dealDeltaPct != null &&
    Number(c.dealDeltaPct) <= -5;
  const sorted = filtered.sort((a, b) => {
    const ad = isActionableDeal(a) ? 1 : 0;
    const bd = isActionableDeal(b) ? 1 : 0;
    if (ad !== bd) return bd - ad; // deals actionnables d'abord
    return Number(b.investmentScore) - Number(a.investmentScore);
  });
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
