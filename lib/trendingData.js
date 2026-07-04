import "server-only";

import { computeCardMetricsScore } from "@/lib/cardScoutScoreMath";
import {
  fetchPlayerLanding,
  resolveFullName,
  resolveHeadshotUrl,
  resolveTeamLabel,
} from "@/lib/nhlPlayerLanding";
import { runInBackground } from "@/lib/backgroundTask";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

// ─── ~100 top active NHL players ─────────────────────────────────────────────
// Stars établies, jeunes stars, espoirs — triés par intérêt carte

export const TRENDING_PLAYER_IDS = [
  // ── Superstars
  8478402, // Connor McDavid
  8477934, // Sidney Crosby
  8480012, // Nathan MacKinnon
  8479318, // Leon Draisaitl
  8477492, // Alex Ovechkin
  8478476, // Auston Matthews
  8479371, // David Pastrnak
  8479354, // Nikita Kucherov
  8479400, // Artemi Panarin
  8480801, // Sebastian Aho

  // ── Stars établies (cartes fortes)
  8479339, // Mitch Marner
  8479325, // Brady Tkachuk
  8478483, // Brad Marchand
  8480797, // Nick Suzuki
  8479683, // Matthew Tkachuk
  8481528, // Sam Reinhart
  8479420, // Jack Hughes
  8480785, // Tim Stützle
  8478476, // Auston Matthews (dupe intentionnel ignoré par Set)
  8479407, // Brayden Point
  8482543, // Cale Makar
  8480762, // Connor Bedard
  8479323, // Mark Scheifele
  8480193, // Elias Lindholm
  8480794, // Sebastian Aho
  8476453, // Claude Giroux
  8481001, // Nico Hischier
  8478500, // Bo Horvat
  8480944, // Miro Heiskanen

  // ── Jeunes stars 24-25 (cartes hot)
  8483515, // Macklin Celebrini ⭐
  8482078, // Ivan Demidov ⭐
  8481533, // Matvei Michkov ⭐
  8482116, // Juraj Slafkovský ⭐
  8483524, // Lane Hutson ⭐
  8481540, // Cole Caufield
  8481478, // Quinton Byfield
  8481600, // Cole Perfetti
  8482671, // Logan Cooley
  8480785, // Tim Stützle
  8482749, // Ridly Greig
  8483500, // Jiri Kulich
  8483504, // Beau Akey
  8482721, // Wyatt Johnston
  8482716, // Adam Fantilli
  8483460, // Will Smith
  8483468, // Zach Benson
  8483474, // Dalibor Dvoracek
  8482756, // Ryan Leonard
  8483536, // Tij Iginla

  // ── Stars offensives
  8479365, // Kyle Connor
  8479361, // Sean Monahan
  8478434, // Aleksander Barkov
  8480330, // Elias Pettersson
  8480315, // Tage Thompson
  8481559, // Jason Robertson
  8480064, // Joel Eriksson Ek
  8479410, // Travis Konecny
  8480762, // Bedard (déjà là)
  8480768, // Quinn Hughes
  8481503, // Noah Dobson
  8479312, // Rasmus Andersson

  // ── Défenseurs haute valeur
  8480069, // Dougie Hamilton
  8478455, // Roman Josi
  8479458, // Drew Doughty
  8481533, // Michkov
  8482798, // Simon Edvinsson
  8483530, // Arber Xhekaj
  8480944, // Miro Heiskanen
  8481531, // Jakob Pelletier

  // ── Stars canadiennes (gros marché cartes)
  8480145, // Kirby Dach
  8481479, // Kent Johnson
  8481496, // Owen Power
  8481480, // Luke Hughes
  8481495, // Shane Wright
  8481488, // Mason McTavish
  8481494, // Matty Beniers
  8481493, // Simon Nemec
  8481501, // Marco Rossi
  8483534, // Cayden Lindstrom

  // ── Joueurs à fort potentiel cartes
  8479322, // Mikko Rantanen
  8480380, // Oliver Bjorkstrand
  8479333, // Mark Stone
  8478449, // Max Pacioretty
  8477953, // Steven Stamkos
  8477934, // Crosby (déjà là)
  8480333, // Andrei Svechnikov
  8481507, // Dylan Guenther
  8481521, // Jake Neighbours
  8481508, // William Eklund
  8481515, // Dylan Cozens
  8482678, // Rutger McGroarty
  8482680, // Brandt Clarke
  8482681, // David Jiricek
  8483519, // Michael Misa
  8483512, // Anton Silayev
];

// ─── Cache config ─────────────────────────────────────────────────────────────

const DEAL_SCORE_MIN = 6.5;

const SUPABASE_CACHE_KEY = "trending-v5";

function getCacheTTL() {
  const month = new Date().getMonth(); // 0 = jan
  const inSeason = month >= 9 || month <= 3; // oct–avril
  return inSeason
    ? 7 * 24 * 60 * 60 * 1000    // 7 jours en saison
    : 180 * 24 * 60 * 60 * 1000; // 6 mois hors-saison
}

let memoryCache = { payload: null, fetchedAt: 0 };

function isFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < getCacheTTL();
}

async function readBlob() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("cache_trending")
      .select("fetched_at, payload")
      .eq("key", SUPABASE_CACHE_KEY)
      .maybeSingle();
    if (error || !data?.payload) return null;
    const fetchedAt = new Date(data.fetched_at).getTime();
    if (!isFresh(fetchedAt)) return null;
    return { fetchedAt, payload: data.payload };
  } catch { return null; }
}

/** Cache expiré mais présent (stale-while-revalidate). */
async function readStaleBlob() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("cache_trending")
      .select("fetched_at, payload")
      .eq("key", SUPABASE_CACHE_KEY)
      .maybeSingle();
    if (error || !data?.payload) return null;
    const fetchedAt = new Date(data.fetched_at).getTime();
    return { fetchedAt, payload: data.payload };
  } catch { return null; }
}

async function writeBlob(entry) {
  const supabase = getSupabaseAdmin();
  await supabase.from("cache_trending").upsert({
    key: SUPABASE_CACHE_KEY,
    fetched_at: new Date(entry.fetchedAt).toISOString(),
    payload: entry.payload,
  }, { onConflict: "key" });
}

// ─── Extraire les stats du landing NHL ───────────────────────────────────────

/**
 * Cherche les stats de saison régulière dans tous les emplacements possibles.
 * Couvre les recrues (first year), les vétérans, et les joueurs avec 0 games.
 */
function extractSeasonStats(data) {
  // 1. featuredStats.regularSeason.subSeason (source principale)
  const sub = data.featuredStats?.regularSeason?.subSeason;
  if (sub?.gamesPlayed > 0) return sub;

  // 2. featuredStats.regularSeason.career (si subSeason vide — fin de saison)
  const career = data.featuredStats?.regularSeason?.career;
  if (career?.gamesPlayed > 0) return career;

  // 3. last5Games ou stats récentes si disponibles
  const last = data.last5Games?.[0];
  if (last) return null; // pas assez de données agrégées

  return null;
}

// ─── Builder par joueur ───────────────────────────────────────────────────────

async function buildPlayerRow(data, id) {
  const fullName = resolveFullName(data);
  const team = resolveTeamLabel(data);
  const headshotUrl = resolveHeadshotUrl(data, id);
  const lastName = data.lastName?.default ?? "";

  const stats = extractSeasonStats(data);

  const scout = computeCardMetricsScore({
    gamesPlayed: stats?.gamesPlayed,
    goals: stats?.goals,
    points: stats?.points,
    lastName,
    fullName,
  });

  // Score mathématique uniquement pour le carrousel d'accueil : pas d'appel
  // Claude par joueur (≈85 appels = 15-25 s de blocage). L'ajustement Claude ±0.5
  // reste appliqué sur la fiche joueur via /api/score, où il compte vraiment.
  const finalScore = scout.ok ? scout.score : null;
  const finalTier = scout.tier;

  return {
    id: String(id),
    name: fullName,
    team,
    headshotUrl,
    points: stats?.points != null ? String(stats.points) : "—",
    score: finalScore,
    tier: finalTier,
    scoutOk: scout.ok,
  };
}

// ─── Build payload complet ────────────────────────────────────────────────────

async function buildFresh() {
  // Dédupliquer les IDs
  const uniqueIds = [...new Set(TRENDING_PLAYER_IDS)];

  // Fetch tous les landings NHL en parallèle
  const landings = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const data = await fetchPlayerLanding(id);
        return data ? { data, id } : null;
      } catch { return null; }
    })
  );

  const valid = landings.filter(Boolean);
  console.log(`[trendingData] ${valid.length}/${uniqueIds.length} joueurs chargés`);

  // Score tous les joueurs
  const players = await Promise.all(
    valid.map(({ data, id }) => buildPlayerRow(data, id))
  );

  // Filtre + tri par score décroissant
  const withScore = players
    .filter((p) => p.scoutOk && p.score != null && p.headshotUrl)
    .sort((a, b) => Number(b.score) - Number(a.score));

  console.log(`[trendingData] ${withScore.length} joueurs scorés, top: ${withScore.slice(0, 5).map(p => `${p.name} ${p.score}`).join(', ')}`);

  // Top 5 "hot"
  const hot = withScore.slice(0, 5);

  // (perf) La page d'accueil cinématique ne consomme que `carouselPlayers`.
  // On évite ~20-40 appels eBay (prix moyen par joueur) qui ralentissaient le
  // build sans servir l'UI. `steals` reste dérivé du score (sans prix eBay).
  const candidates = withScore.filter((p) => Number(p.score) >= DEAL_SCORE_MIN);
  const steals = candidates.slice(0, 3).map((p) => ({
    id: p.id, name: p.name, team: p.team, headshotUrl: p.headshotUrl,
    points: p.points, score: p.score, tier: p.tier,
    avgPriceCad: null,
  }));

  return { hot, steals, stealsUsedPrice: false, carouselPlayers: withScore };
}

// ─── Export public ────────────────────────────────────────────────────────────

/**
 * Retourne le payload trending depuis le cache (mémoire ou Blob).
 * Si le cache est périmé mais existe, retourne les données stale et
 * déclenche un rebuild en arrière-plan (non-bloquant).
 * Si aucun cache : build synchrone (premier démarrage seulement).
 */
export async function buildTrendingPayload({ forceRefresh = false } = {}) {
  // Force refresh demandé (cron)
  if (forceRefresh) {
    const payload = await buildFresh();
    const entry = { fetchedAt: Date.now(), payload };
    memoryCache = entry;
    await writeBlob(entry);
    return structuredClone(payload);
  }

  // 1. Mémoire process — frais
  if (memoryCache.payload && isFresh(memoryCache.fetchedAt)) {
    return structuredClone(memoryCache.payload);
  }

  // 2. Blob — frais
  const blob = await readBlob();
  if (blob) {
    memoryCache = blob;
    return structuredClone(blob.payload);
  }

  // 3. Cache périmé en mémoire — retourner stale + rebuild en background
  if (memoryCache.payload) {
    console.log("[trendingData] Cache périmé (mémoire), rebuild en background");
    runInBackground(async () => {
      const payload = await buildFresh();
      const entry = { fetchedAt: Date.now(), payload };
      memoryCache = entry;
      await writeBlob(entry);
    });
    return structuredClone(memoryCache.payload);
  }

  // 3b. Cache périmé sur disque (ex. redémarrage serveur) — stale immédiat
  const staleBlob = await readStaleBlob();
  if (staleBlob) {
    console.log("[trendingData] Cache périmé (disque), rebuild en background");
    memoryCache = staleBlob;
    runInBackground(async () => {
      const payload = await buildFresh();
      const entry = { fetchedAt: Date.now(), payload };
      memoryCache = entry;
      await writeBlob(entry);
    });
    return structuredClone(staleBlob.payload);
  }

  // 4. Aucun cache du tout — build synchrone (first boot)
  console.log("[trendingData] Premier démarrage, build synchrone...");
  const payload = await buildFresh();
  const entry = { fetchedAt: Date.now(), payload };
  memoryCache = entry;
  await writeBlob(entry);
  return structuredClone(payload);
}
