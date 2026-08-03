import "server-only";

import { CURRENT_SEASON_ID } from "@/lib/opportunitesTop";
import { readJsonCache, writeJsonCache } from "@/lib/persistentCache";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

/**
 * Classe de recrues NHL — les joueurs dont la PREMIÈRE saison NHL est la saison
 * en cours, classés par Card Metrics Score.
 *
 * Définition assumée : `firstSeasonForGameType === seasonId`. Ce n'est PAS la
 * définition officielle du trophée Calder (qui ajoute des conditions d'âge et
 * de matchs joués les saisons précédentes) — l'UI dit donc « première saison
 * NHL », jamais « recrue admissible au Calder ». Guardrail : on n'habille pas
 * une donnée approchée en donnée officielle.
 *
 * Pas de colonne en base : la liste vient de l'API bios NHL et vit dans
 * `cache_generic` (24 h). Elle ne bouge qu'une fois par saison — inutile
 * d'alourdir le schéma de `players` pour ça.
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const FETCH_TIMEOUT_MS = 8000;

/** @param {number} seasonId */
function cacheKey(seasonId) {
  // v3 : v1 stockait un `draftOverall: 0` pour les non-repêchés (Number(null))
  // et paginait sur un tri instable (liste incomplète).
  return `rookie_class_${seasonId}_v3`;
}

/**
 * Forme `cayenneExp` de l'API bios. La forme courte (`?seasonId=…&gameTypeId=…`)
 * renvoie un HTTP 500 — mesuré le 2026-08-03, d'où cette seule variante.
 *
 * `sort=playerId` est OBLIGATOIRE, pas cosmétique : trié par `points`, la
 * pagination de l'API NHL n'est pas stable (des centaines de joueurs partagent
 * le même total), et les pages se recouvrent. Mesuré le 2026-08-03 : 940 lignes
 * pour seulement 923-925 identifiants uniques, et le chiffre bouge d'un appel à
 * l'autre — des joueurs sont donc PURMENT ET SIMPLEMENT absents. Trié sur une
 * clé unique : 940/940, stable sur plusieurs appels.
 *
 * @param {number} seasonId
 * @param {number} start
 */
function biosUrl(seasonId, start) {
  const cayenne = encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2`);
  return `https://api.nhle.com/stats/rest/en/skater/bios?limit=${PAGE_LIMIT}&start=${start}&sort=playerId&dir=ASC&isAggregate=false&isGame=false&cayenneExp=${cayenne}`;
}

/**
 * Récupère toutes les bios de patineurs de la saison.
 * @param {number} seasonId
 * @returns {Promise<object[]>}
 */
async function fetchAllBios(seasonId) {
  /** @type {object[]} */
  const all = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const res = await fetch(biosUrl(seasonId, page * PAGE_LIMIT), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`NHL bios HTTP ${res.status}`);
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    all.push(...rows);
    if (rows.length < PAGE_LIMIT) break;
  }
  return all;
}

/**
 * Ne garde que les premières saisons, et DÉDUPLIQUE par `playerId` : l'API NHL
 * répète les joueurs échangés en cours de saison (une ligne par équipe), ce qui
 * ferait apparaître le même joueur deux fois dans le classement. On conserve la
 * ligne au plus grand nombre de matchs.
 *
 * @param {object[]} bios
 * @param {number} seasonId
 */
function selectRookies(bios, seasonId) {
  /** @type {Map<number, object>} */
  const byId = new Map();
  for (const row of bios) {
    if (Number(row?.firstSeasonForGameType) !== seasonId) continue;
    const id = Number(row?.playerId);
    if (!Number.isFinite(id)) continue;
    const prev = byId.get(id);
    if (!prev || Number(row.gamesPlayed ?? 0) > Number(prev.gamesPlayed ?? 0)) {
      byId.set(id, row);
    }
  }
  return [...byId.values()];
}

/** @param {number} seasonId */
function headshotUrl(seasonId, playerId, teamAbbrev) {
  const season = String(seasonId);
  return teamAbbrev
    ? `https://assets.nhle.com/mugs/nhl/${season}/${teamAbbrev}/${playerId}.png`
    : `https://assets.nhle.com/mugs/nhl/${season}/${playerId}.png`;
}

/**
 * Coercion numérique SÛRE : `Number(null)` vaut 0 et `Number.isFinite(0)` est
 * vrai — un `draftOverall` absent devenait donc un « rang #0 » qui passait en
 * tête du tri par repêchage. Une valeur absente doit rester absente.
 * @param {unknown} v
 * @returns {number | null}
 */
function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {string | null | undefined} birthDate */
function calcAge(birthDate) {
  if (!birthDate) return null;
  const d = new Date(String(birthDate).trim());
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 60 ? age : null;
}

/**
 * @param {object} row
 * @param {number} seasonId
 */
function toRookie(row, seasonId) {
  const playerId = String(row.playerId);
  const gamesPlayed = toNum(row.gamesPlayed);
  const points = toNum(row.points);
  const teamAbbrev = row.currentTeamAbbrev ? String(row.currentTeamAbbrev) : null;
  return {
    playerId,
    fullName: typeof row.skaterFullName === "string" ? row.skaterFullName.trim() : null,
    teamAbbrev,
    positionCode: row.positionCode ? String(row.positionCode).toUpperCase() : null,
    birthDate: row.birthDate ? String(row.birthDate).slice(0, 10) : null,
    age: calcAge(row.birthDate),
    gamesPlayed,
    goals: toNum(row.goals),
    assists: toNum(row.assists),
    points,
    pointsPerGame:
      gamesPlayed && gamesPlayed > 0 && points != null
        ? Math.round((points / gamesPlayed) * 100) / 100
        : null,
    draftYear: toNum(row.draftYear),
    draftOverall: toNum(row.draftOverall),
    headshotUrl: headshotUrl(seasonId, playerId, teamAbbrev),
  };
}

/**
 * Liste brute des recrues (sans score), avec cache 24 h.
 * @param {{ seasonId?: number; forceRefresh?: boolean }} [opts]
 * @returns {Promise<{ seasonId: number; rookies: object[]; fetchedAt: string; stale: boolean }>}
 */
export async function getRookieBios({ seasonId = CURRENT_SEASON_ID, forceRefresh = false } = {}) {
  const key = cacheKey(seasonId);
  const cached = await readJsonCache(key);
  const cachedAt = cached?.fetchedAt ? Date.parse(cached.fetchedAt) : NaN;
  const fresh =
    cached && Number.isFinite(cachedAt) && Date.now() - cachedAt < CACHE_TTL_MS;

  if (fresh && !forceRefresh) {
    return { ...cached, stale: false };
  }

  try {
    const bios = await fetchAllBios(seasonId);
    const rookies = selectRookies(bios, seasonId).map((r) => toRookie(r, seasonId));
    const payload = { seasonId, rookies, fetchedAt: new Date().toISOString() };
    await writeJsonCache(key, payload);
    return { ...payload, stale: false };
  } catch (err) {
    console.error(
      "[rookieClass] fetch bios NHL failed:",
      err instanceof Error ? err.message : err
    );
    // Repli : une liste datée vaut mieux qu'une page vide, mais elle est
    // ÉTIQUETÉE périmée — jamais présentée comme fraîche.
    if (cached?.rookies?.length) {
      console.error(`[rookieClass] repli sur le cache du ${cached.fetchedAt}`);
      return { ...cached, stale: true };
    }
    throw err;
  }
}

/**
 * Recrues enrichies du Card Metrics Score (source de vérité `player_scores`).
 * Un joueur sans score reste dans la liste avec `score: null` — état vide
 * honnête, jamais un 0 inventé.
 *
 * @param {{ seasonId?: number; forceRefresh?: boolean }} [opts]
 */
export async function getRookieClass(opts = {}) {
  const base = await getRookieBios(opts);
  const ids = base.rookies.map((r) => r.playerId);

  /** @type {Map<string, { score: number | null; tier: string | null; scoreMode: string | null }>} */
  const scoreMap = new Map();
  if (ids.length > 0) {
    try {
      const db = getSupabaseAdmin();
      const { data, error } = await db
        .from("player_scores")
        .select("player_id, score, tier, data")
        .in("player_id", ids);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const score = Number(row.score);
        scoreMap.set(String(row.player_id), {
          score: Number.isFinite(score) ? score : null,
          tier: row.tier ?? null,
          scoreMode: row.data?.scoreMode ?? null,
        });
      }
    } catch (err) {
      console.error(
        "[rookieClass] lecture player_scores failed — recrues servies sans score:",
        err instanceof Error ? err.message : err
      );
    }
  }

  const rookies = base.rookies.map((r) => {
    const s = scoreMap.get(r.playerId);
    return {
      ...r,
      score: s?.score ?? null,
      tier: s?.tier ?? null,
      scoreMode: s?.scoreMode ?? null,
    };
  });

  // Tri par défaut : score, puis points, puis id — même tie-break que partout
  // ailleurs (guardrail CLAUDE.md). Les joueurs sans score passent après.
  rookies.sort((a, b) => {
    if (a.score != null && b.score == null) return -1;
    if (a.score == null && b.score != null) return 1;
    let d = (b.score ?? -1) - (a.score ?? -1);
    if (d === 0) d = (b.points ?? -1) - (a.points ?? -1);
    if (d === 0) d = a.playerId.localeCompare(b.playerId);
    return d;
  });

  const scored = rookies.filter((r) => r.score != null).length;

  return {
    seasonId: base.seasonId,
    fetchedAt: base.fetchedAt,
    stale: base.stale,
    total: rookies.length,
    scored,
    rookies,
  };
}
