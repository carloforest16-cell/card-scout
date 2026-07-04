/**
 * Source unique de vérité pour les 13 facteurs du Card Metrics Score (v7.1).
 * Poids en fraction (somme = 1.00). Fichier volontairement sans "server-only"
 * (contrairement à cardScoutScore.js) pour rester importable depuis des
 * composants client (ex. PlayerAiScoreClient.js) ET depuis cardScoutScore.js
 * côté serveur — évite la duplication de poids qui a dérivé à plusieurs
 * endroits de l'UI (voir tâche 3.1 du plan).
 * @type {Array<{ key: string; label: string; weight: number; emoji: string }>}
 */
export const SCORE_WEIGHTS = [
  { key: "performance", label: "Performance", weight: 0.14, emoji: "⚡" },
  { key: "momentum", label: "Momentum", weight: 0.10, emoji: "📈" },
  { key: "momentumDetailed", label: "Accélération", weight: 0.08, emoji: "🏎️" },
  { key: "age", label: "Âge", weight: 0.10, emoji: "🎂" },
  { key: "marketValue", label: "Marché", weight: 0.10, emoji: "💰" },
  { key: "liquidity", label: "Liquidité", weight: 0.04, emoji: "🔄" },
  { key: "upside", label: "Upside", weight: 0.14, emoji: "🚀" },
  { key: "hype", label: "Hype", weight: 0.07, emoji: "🔥" },
  { key: "marketDiscrepancy", label: "Discrépance", weight: 0.05, emoji: "🎯" },
  { key: "risk", label: "Risque", weight: 0.05, emoji: "🛡️" },
  { key: "catalysts", label: "Catalyseurs", weight: 0.06, emoji: "⚡" },
  { key: "socialAttention", label: "Buzz", weight: 0.03, emoji: "📢" },
  { key: "teamContext", label: "Équipe", weight: 0.04, emoji: "🏒" },
];

/** @type {Record<string, number>} */
export const SCORE_WEIGHTS_BY_KEY = Object.fromEntries(
  SCORE_WEIGHTS.map((f) => [f.key, f.weight])
);

/**
 * Poids affiché en entier (ex. 0.14 → 14), pour l'UI.
 * @param {number} weight
 */
export function weightToPct(weight) {
  return Math.round(Number(weight) * 100);
}

/**
 * Card Metrics Score rapide (0–10), logique pure sans API — aperçu trending / home.
 * @param {object} input
 * @param {number|string|null|undefined} input.gamesPlayed
 * @param {number|string|null|undefined} input.goals
 * @param {number|string|null|undefined} input.points
 * @param {string|null|undefined} input.lastName
 * @param {string|null|undefined} input.fullName
 */
export function computeCardMetricsScore(input) {
  const gp = toNum(input.gamesPlayed);
  const goals = toNum(input.goals);
  const pts = toNum(input.points);

  const shortName =
    (input.lastName && String(input.lastName).trim()) ||
    lastToken(input.fullName) ||
    "Ce joueur";

  if (gp == null || gp <= 0 || pts == null) {
    return {
      ok: false,
      score: null,
      tier: "unknown",
      summary:
        "Pas assez de données de saison régulière pour calculer le Card Metrics Score.",
      ppg: null,
    };
  }

  const ppg = pts / gp;

  let score = 5;

  if (ppg > 1.0) {
    score += 2.5;
  } else if (ppg >= 0.7) {
    score += 1.2;
  } else {
    score -= 0.5;
  }

  if (goals != null) {
    if (goals > 40) {
      score += 1.5;
    } else if (goals < 15) {
      score -= 1;
    }
  }

  if (gp > 70) {
    score += 1;
  } else if (gp < 50) {
    score -= 1;
  }

  score = Math.min(10, Math.max(0, score));
  const scoreRounded = Math.round(score * 10) / 10;

  let tier;
  if (scoreRounded >= 7) {
    tier = "high";
  } else if (scoreRounded >= 4) {
    tier = "mid";
  } else {
    tier = "low";
  }

  const ppgStr = formatFrDecimal(ppg, 2);
  const goalsStr = goals != null ? String(goals) : null;

  let summary;
  if (tier === "high") {
    if (goalsStr != null && goals > 0) {
      summary = `${shortName} domine avec ${ppgStr} pts/match et ${goalsStr} buts — fenêtre d'achat sur ses cartes`;
    } else {
      summary = `${shortName} domine avec ${ppgStr} pts/match — solide valeur sur ses cartes`;
    }
  } else if (tier === "mid") {
    summary = `${shortName} affiche ${ppgStr} pts/match${goalsStr != null ? ` et ${goalsStr} buts` : ""} — profil correct, surveiller les creux de prix`;
  } else {
    summary = `${shortName} est à ${ppgStr} pts/match (${goalsStr ?? "—"} buts, ${gp} MJ) — prudence, demande plus fragile pour ses cartes`;
  }

  return {
    ok: true,
    score: scoreRounded,
    tier,
    summary,
    ppg,
  };
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function lastToken(fullName) {
  if (!fullName || typeof fullName !== "string") return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function formatFrDecimal(n, decimals) {
  return n.toFixed(decimals).replace(".", ",");
}
