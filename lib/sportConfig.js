/**
 * Configuration multi-sport pour Card Scout.
 *
 * Le projet est NHL-only pour l'instant, mais cette couche d'abstraction
 * permettra la réplication future vers NBA → NFL → MLB sans réécrire la
 * logique de scoring. Chaque sport déclare ses seuils, mapping de stats,
 * et règles spécifiques. La logique générique de cardScoutScore.js lit
 * depuis SPORT_CONFIGS[sport] au lieu de constantes hardcodées.
 *
 * Pour ajouter un sport :
 *  1. Ajouter une entrée dans SPORT_CONFIGS avec la même forme
 *  2. Brancher l'extracteur de stats (équivalent buildScorePayloadFromLanding)
 *  3. Ajuster les tables (colonne `sport` déjà présente depuis PR 13)
 *
 * @typedef {object} SportConfig
 * @property {string} id
 * @property {string} label
 * @property {{ start: number, end: number }} seasonMonths
 * @property {number} leagueAvgOffensiveRate — ex. NHL PPG ≈ 0.6
 * @property {{ forward: string[], defense: string[], goalie: string[] }} positionGroups
 * @property {object} performanceThresholds
 * @property {object} ageThresholds
 * @property {object} candidateFilters — seuils pour opportunites/underdog
 */

/** @type {Record<string, SportConfig>} */
export const SPORT_CONFIGS = {
  NHL: {
    id: "NHL",
    label: "Hockey NHL",
    seasonMonths: { start: 9, end: 3 }, // oct → avril
    leagueAvgOffensiveRate: 0.6, // PPG moyen NHL
    positionGroups: {
      forward: ["C", "L", "R", "LW", "RW"],
      defense: ["D"],
      goalie: ["G"],
    },
    // Seuils pour scorePerformance — voir cardScoutScore.js
    performanceThresholds: {
      forward: { elite: 1.4, top: 1.2, solid: 1.0, average: 0.85, third: 0.7, fourth: 0.55, fringe: 0.4, depth: 0.25 },
      defense: { elite: 0.9, top: 0.75, solid: 0.6, average: 0.5, depth: 0.4, fringe: 0.3, ahl: 0.2, deepDepth: 0.12 },
      goalie: { vezina: 0.925, starter: 0.915, mid: 0.905, backup: 0.895 },
    },
    // Courbe d'âge (sweet spot d'appréciation des cartes)
    ageThresholds: {
      young: 23,
      prime: 26,
      late: 28,
      decline: 30,
      veteran: 33,
      peakByPosition: {
        forward: [24, 28],
        defense: [26, 30],
        goalie: [27, 32],
      },
    },
    // Filtres pour opportunitesTop / underdogFinder
    candidateFilters: {
      minGamesPlayed: 10,
      maxAge: 30,
      underdogMinAge: 18,
      underdogMaxAge: 25,
      underdogMinGames: 20,
      underdogMinPoints: 10,
    },
    // Marchés à immense base de collectionneurs
    megaCardMarkets: ["MTL", "TOR"],
    bigCardMarkets: ["EDM", "CGY", "VAN", "OTT", "WPG", "NYR", "BOS", "CHI", "DET"],
  },
};

/**
 * Retourne la config d'un sport (default 'NHL').
 * @param {string} [sport]
 * @returns {SportConfig}
 */
export function getSportConfig(sport = "NHL") {
  const key = String(sport ?? "NHL").toUpperCase();
  return SPORT_CONFIGS[key] ?? SPORT_CONFIGS.NHL;
}

/**
 * Classifie une position dans un groupe générique (forward/defense/goalie).
 * @param {string} position
 * @param {string} [sport]
 * @returns {"forward" | "defense" | "goalie" | null}
 */
export function classifyPosition(position, sport = "NHL") {
  const config = getSportConfig(sport);
  const p = String(position ?? "").toUpperCase();
  if (config.positionGroups.goalie.includes(p)) return "goalie";
  if (config.positionGroups.defense.includes(p)) return "defense";
  if (config.positionGroups.forward.includes(p)) return "forward";
  return null;
}

export const DEFAULT_SPORT = "NHL";
