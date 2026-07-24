import "server-only";

import { getTopStoredScores } from "@/lib/playerScores";

// Assez de matchs pour un signal de score fiable (aligné avec l'annuaire).
const MIN_GP = 10;

/**
 * Bassin de candidats pour le moteur « Meilleurs investissements »
 * (PLAN-OPPORTUNITY-ENGINE.md, Phase 1). Source : `player_scores` via
 * `getTopStoredScores` (full-scores uniquement, triés par score décroissant).
 *
 * Pas de logique d'upside séparée : le Card Metrics Score encode DÉJÀ l'upside
 * (âge, momentum, accélération) — les meilleurs scores incluent naturellement
 * les jeunes en montée (le spike Phase 0.2 a fait remonter Carlsson 7,5,
 * Slafkovský 7,6, Demidov 7…). On filtre juste GP ≥ 10 et on déduplique par
 * player_id (filet — cf. bug des tradés dupliqués dans le sync).
 *
 * @param {{ limit?: number }} [options]
 * @returns {Promise<Array<{ id: string; name: string; score: number | null; team: string | null; headshotUrl: string | null; points: number | null; gamesPlayed: number | null }>>}
 */
export async function getInvestmentCandidatePlayers({ limit = 120 } = {}) {
  // Marge de tête pour absorber le filtre GP sans redescendre sous `limit`.
  const rows = await getTopStoredScores(limit + 60);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const id = String(r.player_id ?? "");
    const name = String(r.player_name ?? "").trim();
    if (!id || !name || seen.has(id)) continue;
    if (Number(r.games_played) < MIN_GP) continue;
    seen.add(id);
    out.push({
      id,
      name,
      score: Number(r.score) || null,
      team: r.team ?? null,
      headshotUrl: r.headshot_url ?? null,
      points: Number(r.points) || null,
      gamesPlayed: Number(r.games_played) || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}
