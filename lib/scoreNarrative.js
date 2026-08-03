/**
 * Explications TEXTUELLES du Card Metrics Score — aucune modification de
 * l'algorithme, aucun chiffre calculé ici.
 *
 * Contexte (PLAN-DEAL-FINDER, D4) : l'algo v7.1 pondère fortement la jeunesse
 * (10 %) et l'upside (14 %). Conséquence assumée et défendable pour un horizon
 * d'investissement — mais elle surprend : Connor McDavid ressort à 6,1 sous
 * Macklin Celebrini à 8,2. C'est un problème de COMMUNICATION, pas de calcul.
 */

/** Producteur crédible : en dessous, le score bas n'a rien de surprenant. */
const ESTABLISHED_MIN_PPG = 0.6;
/** Carrière déjà installée — l'un OU l'autre suffit. */
const ESTABLISHED_MIN_SEASONS = 4;
const ESTABLISHED_MIN_AGE = 25;
/** Au-dessus, le score ne surprend plus personne. */
const SURPRISING_SCORE_MAX = 7;

/**
 * Le score de ce joueur mérite-t-il une note explicative ? Vrai uniquement pour
 * un producteur ÉTABLI dont le score reste sous 7. Toute donnée manquante →
 * faux : on n'explique jamais un cas qu'on ne peut pas établir.
 *
 * @param {{ cardMetricsScore?: number | null; pointsPerGame?: number | null; nhlSeasons?: number | null; ageYears?: number | null } | null} [player]
 * @returns {boolean}
 */
export function scoreSurprisesForEstablishedPlayer(player) {
  if (!player) return false;
  const score = Number(player.cardMetricsScore);
  if (!Number.isFinite(score) || score >= SURPRISING_SCORE_MAX) return false;
  const ppg = Number(player.pointsPerGame);
  if (!Number.isFinite(ppg) || ppg < ESTABLISHED_MIN_PPG) return false;
  const seasons = Number(player.nhlSeasons);
  const age = Number(player.ageYears);
  const established =
    (Number.isFinite(seasons) && seasons >= ESTABLISHED_MIN_SEASONS) ||
    (Number.isFinite(age) && age >= ESTABLISHED_MIN_AGE);
  return established;
}

/**
 * Note à afficher là où le score joueur est montré, quand il surprend.
 * Retourne `null` si le cas ne s'applique pas — jamais un texte générique.
 *
 * @param {Parameters<typeof scoreSurprisesForEstablishedPlayer>[0]} [player]
 * @returns {string | null}
 */
export function establishedUpsideNote(player) {
  if (!scoreSurprisesForEstablishedPlayer(player)) return null;
  return "Score orienté potentiel d'appréciation de la carte, pas talent sur la glace : un joueur établi à son sommet a moins de marge de progression qu'un jeune en ascension, ce qui pèse sur le score.";
}
