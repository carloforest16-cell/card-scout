/**
 * Card Scout Score rapide (0–10), logique pure sans API — aperçu trending / home.
 * @param {object} input
 * @param {number|string|null|undefined} input.gamesPlayed
 * @param {number|string|null|undefined} input.goals
 * @param {number|string|null|undefined} input.points
 * @param {string|null|undefined} input.lastName
 * @param {string|null|undefined} input.fullName
 */
export function computeCardScoutScore(input) {
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
        "Pas assez de données de saison régulière pour calculer le Card Scout Score.",
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
