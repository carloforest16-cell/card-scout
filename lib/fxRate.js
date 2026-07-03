import "server-only";

import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";

/**
 * Taux de change USD→CAD — remplace le `1.37` hardcodé qui traînait dans
 * `ebayServer.js` ET `soldPrices.js` (deux copies indépendantes du même
 * nombre magique). Source : Banque du Canada (Valet API, gratuite, sans clé).
 *
 * `listingPriceToCad` et le parseur 130point sont appelés de façon
 * SYNCHRONE, en boucle serrée (`.map()`), dans 6 fichiers différents —
 * les transformer en async aurait un rayon d'impact bien plus large que
 * "un seul import partagé". Design retenu à la place : un cache mémoire
 * synchrone (`getUsdToCadRateSync`), rafraîchi en tâche de fond
 * (fire-and-forget, jamais bloquant) via `refreshFxRateIfStale`. Le
 * fallback 1.37 protège le tout premier appel d'une instance serverless
 * froide, avant que le premier rafraîchissement n'ait eu le temps de finir.
 */

const FALLBACK_RATE = 1.37;
const CACHE_KEY = "fx-usd-cad-v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const VALET_URL = "https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1";

/** @type {{ rate: number; fetchedAt: number }} */
let memoryRate = { rate: FALLBACK_RATE, fetchedAt: 0 };
let refreshInFlight = null;

function isFresh(fetchedAt) {
  return Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CACHE_TTL_MS;
}

async function fetchRateFromValet() {
  const res = await fetch(VALET_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Valet API ${res.status}`);
  const data = await res.json();
  const obs = data?.observations?.[0]?.FXUSDCAD?.v;
  const rate = Number(obs);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 3) {
    // Garde-fou : un taux USD/CAD hors [0, 3] est forcément une erreur de
    // parsing, pas une vraie valeur de marché — ne jamais l'utiliser.
    throw new Error(`Taux invalide reçu: ${obs}`);
  }
  return rate;
}

/**
 * Rafraîchit le cache (mémoire + Supabase) si périmé. Jamais bloquant pour
 * l'appelant s'il est utilisé en fire-and-forget (sans await) — mais peut
 * aussi être awaité par un appelant déjà async (crons, routes).
 * @returns {Promise<void>}
 */
export async function refreshFxRateIfStale() {
  if (isFresh(memoryRate.fetchedAt)) return;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const persisted = await readJsonCache(CACHE_KEY);
      if (persisted?.rate && isFresh(persisted.fetchedAt)) {
        memoryRate = { rate: persisted.rate, fetchedAt: persisted.fetchedAt };
        return;
      }
      const rate = await fetchRateFromValet();
      const entry = { rate, fetchedAt: Date.now() };
      memoryRate = entry;
      await writeJsonCache(CACHE_KEY, entry);
    } catch {
      // Échec réseau/parsing : on garde le taux mémoire actuel (ou 1.37 par
      // défaut) sans jamais throw — la conversion de prix ne doit jamais
      // planter à cause d'un souci de taux de change.
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Taux USD→CAD actuel, synchrone — pour les call sites qui ne peuvent pas
 * await (boucles de transformation de listings). Déclenche un
 * rafraîchissement en tâche de fond si périmé, mais retourne toujours
 * immédiatement (mémoire actuelle, ou 1.37 au tout premier appel froid).
 * @returns {number}
 */
export function getUsdToCadRateSync() {
  if (!isFresh(memoryRate.fetchedAt)) {
    refreshFxRateIfStale().catch(() => {});
  }
  return memoryRate.rate;
}

/**
 * Variante awaitable pour les appelants déjà async (routes, crons) qui
 * préfèrent un taux frais garanti plutôt que la valeur mémoire courante.
 * @returns {Promise<number>}
 */
export async function getUsdToCadRate() {
  await refreshFxRateIfStale();
  return memoryRate.rate;
}
