/**
 * Sous-score Risque / Downside Protection.
 *
 * Échelle INVERSÉE : 10 = risque le plus bas (carte « safe »),
 *                     0 = risque maximal (carte spéculative).
 *
 * Composantes :
 *  - Courbe âge-position (déclin attendu selon position du joueur)
 *  - Durabilité (% de matchs joués cette saison vs total possible)
 *  - Stade de carrière (UFA imminente, vétéran tardif = incertitude)
 */

const NHL_GAMES_PER_SEASON = 82;

/**
 * Score basé sur la courbe d'âge typique d'une position NHL.
 * @param {number | null | undefined} ageYears
 * @param {string | null | undefined} position
 * @returns {number} 0-10 (10 = âge optimal)
 */
function scoreAgeCurve(ageYears, position) {
  const age = Number(ageYears);
  if (!Number.isFinite(age)) return 6; // inconnu → légèrement neutre

  const pos = String(position ?? "").toUpperCase();

  // Gardiens : courbe la plus tardive
  if (pos === "G") {
    if (age <= 24) return 7;          // jeune, mais variance énorme
    if (age <= 28) return 8.5;        // monte
    if (age <= 32) return 9;          // peak gardien
    if (age <= 35) return 6;          // déclin commence
    return 3;
  }

  // Défenseurs : peak ~26-30
  if (pos === "D") {
    if (age <= 22) return 6.5;        // jeune, courbe d'apprentissage longue
    if (age <= 26) return 9;
    if (age <= 30) return 9;          // peak D
    if (age <= 33) return 6;
    return 3.5;
  }

  // Attaquants (C/LW/RW) : peak 24-28
  if (age <= 21) return 7;            // upside max mais variance haute
  if (age <= 24) return 9;
  if (age <= 28) return 9;            // peak
  if (age <= 30) return 7;
  if (age <= 33) return 4.5;
  return 2.5;
}

/**
 * Score de durabilité : matchs joués cette saison vs prorata attendu.
 * Un joueur qui rate beaucoup de matchs = flag blessure récurrente.
 *
 * @param {number | null | undefined} gamesPlayedThisSeason
 * @param {number | null | undefined} expectedSoFar — matchs joués par son équipe
 * @returns {number} 0-10
 */
function scoreDurability(gamesPlayedThisSeason, expectedSoFar = null) {
  const gp = Number(gamesPlayedThisSeason);
  if (!Number.isFinite(gp) || gp < 0) return 6;

  // Si on ne connaît pas le prorata équipe, on tolère sans punir agressivement.
  const expected = Number(expectedSoFar);
  if (!Number.isFinite(expected) || expected <= 0) {
    // Tôt dans la saison : faible signal. On regarde l'absolu.
    if (gp >= 60) return 9;
    if (gp >= 40) return 8;
    if (gp >= 20) return 6.5;
    return 6;
  }

  const ratio = gp / expected;
  if (ratio >= 0.95) return 10;
  if (ratio >= 0.85) return 8.5;
  if (ratio >= 0.7) return 6;
  if (ratio >= 0.5) return 4;
  return 2.5;
}

/**
 * Score de stade de carrière : signale les incertitudes structurelles
 * (UFA imminente, vétéran sur sortie de courbe).
 *
 * Sans accès direct au statut contractuel public, on l'approxime via :
 *  - âge ≥ 27 + 8+ saisons NHL = UFA-eligible probable
 *  - âge ≥ 33 = fin de carrière en vue
 *
 * @param {number | null | undefined} ageYears
 * @param {number | null | undefined} nhlSeasons
 * @returns {number} 0-10
 */
function scoreCareerStage(ageYears, nhlSeasons) {
  const age = Number(ageYears);
  const seasons = Number(nhlSeasons);

  if (!Number.isFinite(age)) return 6;

  // Jeune en pleine construction de carrière → faible incertitude structurelle
  if (age <= 24) return 9;

  // Vétéran tardif : risque de fin de carrière brutale
  if (age >= 35) return 2;
  if (age >= 33) return 4;

  // UFA-eligible (proxy : 8+ saisons OU 27+ ans) → incertitude trade
  if (Number.isFinite(seasons) && seasons >= 8) return 5.5;
  if (age >= 27) return 6.5;

  return 8;
}

/**
 * Calcule le score Risque global (0-10, inversé : 10 = safe).
 *
 * @param {object} input
 * @param {number | null} [input.ageYears]
 * @param {string | null} [input.position]
 * @param {number | null} [input.nhlSeasons]
 * @param {number | null} [input.gamesPlayed] — matchs joués cette saison
 * @param {number | null} [input.expectedGamesSoFar] — matchs joués par son équipe (optionnel)
 * @returns {{ score: number; breakdown: { ageCurve: number; durability: number; careerStage: number } }}
 */
export function computeRiskScore({
  ageYears,
  position,
  nhlSeasons,
  gamesPlayed,
  expectedGamesSoFar = null,
}) {
  const ageCurve = scoreAgeCurve(ageYears, position);
  const durability = scoreDurability(gamesPlayed, expectedGamesSoFar);
  const careerStage = scoreCareerStage(ageYears, nhlSeasons);

  // Moyenne pondérée : âge-position pèse le plus, durabilité ensuite, stade en troisième.
  const weighted = ageCurve * 0.5 + durability * 0.3 + careerStage * 0.2;
  const score = Math.round(Math.min(10, Math.max(0, weighted)) * 10) / 10;

  return {
    score,
    breakdown: {
      ageCurve: Math.round(ageCurve * 10) / 10,
      durability: Math.round(durability * 10) / 10,
      careerStage: Math.round(careerStage * 10) / 10,
    },
  };
}

// Constantes utiles pour les callers
export const RISK_CONSTANTS = {
  NHL_GAMES_PER_SEASON,
};
