import "server-only";

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { FACTOR_WEIGHTS, tierFromScore } from "@/lib/cardScoutScore";

/**
 * Enrichissement des scores stockés avec les 4 sous-scores avancés que le cron
 * recompute (fastMode) ne calcule PAS : marketDiscrepancy, teamContext,
 * catalysts, socialAttention.
 *
 * Ces sous-scores font des appels DB/HTTP externes (trop lents pour le recompute
 * complet sur 150 joueurs avec DeepSeek). On les calcule ici SANS DeepSeek, par
 * lots, et on persiste data.factors + les Meta dans player_scores.
 *
 * Idempotent : ré-exécutable, met simplement à jour les sous-scores.
 */

const ENRICH_CONCURRENCY = 4;

/**
 * Lit le score numérique d'un facteur stocké ({score, weight} ou number).
 * @param {Record<string, unknown>} factors
 * @param {string} key
 * @returns {number}
 */
function readFactorScore(factors, key) {
  const raw = factors?.[key];
  if (raw != null && typeof raw === "object" && "score" in raw) {
    const s = Number(raw.score);
    return Number.isFinite(s) ? s : 5;
  }
  if (typeof raw === "number") return raw;
  return 5;
}

/**
 * Recalcule le total pondéré à partir des scores de facteurs mis à jour.
 * @param {Record<string, number>} scores
 * @returns {number}
 */
function weightedTotal(scores) {
  let total = 0;
  for (const [key, weight] of Object.entries(FACTOR_WEIGHTS)) {
    total += (scores[key] ?? 5) * weight;
  }
  return Math.round(total * 1000) / 1000;
}

/**
 * Enrichit une ligne player_scores. Retourne la ligne mise à jour ou null.
 * @param {{ player_id: string; player_name: string; team: string | null; data: Record<string, unknown> }} row
 */
async function enrichRow(row) {
  const data = row?.data;
  if (!data || typeof data !== "object" || !data.ok || !data.factors) return null;

  const factors = { ...data.factors };
  const playerId = String(row.player_id ?? "");
  const playerName = String(row.player_name ?? "");
  const teamAbbrev = row.team ?? data.teamAbbrev ?? null;

  // Score courant = total pondéré actuel (base pour la discrépance).
  const currentScore = Number(data.score) || readFactorScore(factors, "weightedScore") || 5;

  // Calcule les 4 sous-scores en parallèle. Chacun dégrade proprement à 5.
  const [discRes, teamRes, catRes, socialRes] = await Promise.allSettled([
    (async () => {
      const { computeMarketDiscrepancy } = await import("@/lib/marketDiscrepancy");
      return computeMarketDiscrepancy(playerId, playerName, currentScore);
    })(),
    (async () => {
      if (!teamAbbrev) return null;
      const { fetchTeamContextScore } = await import("@/lib/teamContext");
      return fetchTeamContextScore(teamAbbrev);
    })(),
    (async () => {
      const { detectUpcomingCatalysts } = await import("@/lib/catalystDetector");
      return detectUpcomingCatalysts({ teamAbbrev, careerStats: data.careerStats });
    })(),
    (async () => {
      if (!playerName) return null;
      const { fetchSocialScore } = await import("@/lib/socialAttention");
      return fetchSocialScore(playerName);
    })(),
  ]);

  const metaByKey = {
    marketDiscrepancy: discRes.status === "fulfilled" ? discRes.value : null,
    teamContext: teamRes.status === "fulfilled" ? teamRes.value : null,
    catalysts: catRes.status === "fulfilled" ? catRes.value : null,
    socialAttention: socialRes.status === "fulfilled" ? socialRes.value : null,
  };

  // Construit l'objet de scores numériques à partir des facteurs existants,
  // puis applique les sous-scores fraîchement calculés.
  const scores = {};
  for (const key of Object.keys(FACTOR_WEIGHTS)) {
    scores[key] = readFactorScore(factors, key);
  }

  let changed = false;
  for (const [key, meta] of Object.entries(metaByKey)) {
    if (meta && Number.isFinite(meta.score)) {
      scores[key] = meta.score;
      factors[key] = { score: Math.round(meta.score * 10) / 10, weight: FACTOR_WEIGHTS[key] ?? 0 };
      factors[`${key}Meta`] = meta;
      changed = true;
    }
  }

  if (!changed) return null;

  // Recompute le total pondéré (les nouveaux poids prennent effet).
  const newWeighted = weightedTotal(scores);
  factors.weightedScore = newWeighted;

  // Le score affiché conserve l'ajustement DeepSeek éventuel (scoreAdjustment).
  const adj = Number(factors.scoreAdjustment) || 0;
  const newScore = Math.round(Math.min(10, Math.max(0, newWeighted + adj)) * 10) / 10;

  const newData = { ...data, factors, score: newScore };

  return {
    player_id: row.player_id,
    player_name: row.player_name,
    team: row.team,
    score: newScore,
    tier: tierFromScore(newScore),
    data: newData,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Enrichit tous les scores stockés (ou un sous-ensemble) avec les sous-scores
 * avancés. Écrit au fil de l'eau par lots.
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ scanned: number; enriched: number }>}
 */
export async function enrichStoredScores(options = {}) {
  const db = getSupabaseAdmin();
  let query = db
    .from("player_scores")
    .select("player_id, player_name, team, data")
    .order("score", { ascending: false });
  if (Number.isFinite(options.limit) && options.limit > 0) {
    query = query.limit(options.limit);
  }
  const { data: rows, error } = await query;
  if (error || !Array.isArray(rows)) {
    return { scanned: 0, enriched: 0 };
  }

  let enriched = 0;
  for (let i = 0; i < rows.length; i += ENRICH_CONCURRENCY) {
    const chunk = rows.slice(i, i + ENRICH_CONCURRENCY);
    const updated = (
      await Promise.all(
        chunk.map((r) =>
          enrichRow(r).catch((e) => {
            console.error(`[enrich] ${r?.player_name}: ${e?.message}`);
            return null;
          })
        )
      )
    ).filter(Boolean);
    if (updated.length > 0) {
      const { error: upErr } = await db
        .from("player_scores")
        .upsert(updated, { onConflict: "player_id" });
      if (upErr) console.error(`[enrich] upsert: ${upErr.message}`);
      else enriched += updated.length;
    }
  }

  return { scanned: rows.length, enriched };
}
