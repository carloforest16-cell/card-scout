/**
 * Calcul PUR du backtest du Card Metrics Score (aucun I/O, aucun alias `@/`,
 * pas de "server-only") — importable tel quel par un script `node` de test.
 *
 * Question posée : les joueurs bien notés à la date T ont-ils vu leurs cartes
 * mieux performer ensuite que les joueurs mal notés ?
 *
 * Règle d'or : on compare TOUJOURS la même carte à elle-même. Une « cohorte »
 * = (joueur, card_type, grade) dans `card_price_history`. L'ancien calcul
 * faisait la moyenne de TOUTES les annonces du joueur aux deux dates : si une
 * auto à 500 $ était en vente en juillet et seulement des bases à 5 $ en
 * septembre, le joueur « chutait de 73 % » sans que rien n'ait bougé (Dahlin,
 * mesuré le 2026-09-22 : −73 % en mélange, −16 % en cohortes appariées).
 * La ligne agrégée `card_type = "ALL"` est donc exclue d'office.
 *
 * Rendement d'un joueur = MÉDIANE des rendements de ses cohortes appariées
 * (une cohorte rare et explosive ne peut pas dominer le signal).
 *
 * Lecture du résultat : par tiers de score (bas / milieu / haut) plutôt qu'une
 * corrélation de Pearson seule — « les scores hauts ont fait X points de mieux
 * que les scores bas » se lit sans cours de stats, et la médiane par tiers est
 * robuste aux valeurs extrêmes des prix demandés.
 */

const DAY_MS = 86_400_000;

// Seuils de fiabilité : en dessous, le résultat est du bruit statistique et ne
// doit pas être publié (seul l'admin voit l'aperçu).
export const MIN_RELIABLE_SAMPLE = 30;
export const MIN_RELIABLE_TIER = 10;

// Fenêtre de tolérance autour de la date T (les snapshots de prix tombent
// 2×/semaine, ceux de score 1×/jour).
const START_BEFORE_DAYS = 7;
const START_AFTER_DAYS = 3;
const RECENT_DAYS = 10;
const SCORE_MATCH_DAYS = 3;

// Sous ce seuil d'écart (points de %), on ne prétend pas qu'un tiers bat l'autre.
const FLAT_SPREAD_PTS = 2;

/** @param {Date} d */
function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

/**
 * Bornes de dates utiles pour une fenêtre donnée — exposées pour que la route
 * API ne lise que les lignes nécessaires.
 * @param {number} horizonDays
 * @param {Date} [now]
 */
export function backtestWindow(horizonDays, now = new Date()) {
  const t = now.getTime() - horizonDays * DAY_MS;
  return {
    targetDate: isoDay(new Date(t)),
    startFrom: isoDay(new Date(t - START_BEFORE_DAYS * DAY_MS)),
    startTo: isoDay(new Date(t + START_AFTER_DAYS * DAY_MS)),
    recentFrom: isoDay(new Date(now.getTime() - RECENT_DAYS * DAY_MS)),
    scoreFrom: isoDay(new Date(t - (START_BEFORE_DAYS + SCORE_MATCH_DAYS) * DAY_MS)),
    scoreTo: isoDay(new Date(t + (START_AFTER_DAYS + SCORE_MATCH_DAYS) * DAY_MS)),
  };
}

/** @param {number[]} values */
export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Rangs moyens (gère les ex æquo) — base de la corrélation de Spearman.
 * @param {number[]} values
 */
function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = avg;
    i = j + 1;
  }
  return out;
}

/**
 * Corrélation de rang de Spearman (−1 à 1). Moins sensible que Pearson aux
 * rendements extrêmes des prix demandés.
 * @param {number[]} xs
 * @param {number[]} ys
 */
export function spearman(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const rx = ranks(xs.slice(0, n));
  const ry = ranks(ys.slice(0, n));
  const mean = (n + 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mean) * (ry[i] - mean);
    dx += (rx[i] - mean) ** 2;
    dy += (ry[i] - mean) ** 2;
  }
  const denom = Math.sqrt(dx * dy);
  if (!denom) return null;
  return Math.round((num / denom) * 1000) / 1000;
}

/**
 * @param {string} dateIso
 * @param {string} targetIso
 */
function distanceDays(dateIso, targetIso) {
  return Math.abs(Date.parse(dateIso) - Date.parse(targetIso)) / DAY_MS;
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * @param {object} input
 * @param {Array<{ player_name: string; card_type: string; grade: string; snapshot_date: string; median_price_cad: number|string }>} input.priceRows
 *   lignes de `card_price_history` (fenêtre de départ + fenêtre récente)
 * @param {Array<{ player_id: number|string; score: number|string; snapshot_date: string }>} input.scoreRows
 *   lignes de `player_scores_history` autour de la date T
 * @param {Array<{ player_id: number|string; player_name: string; team?: string; headshot_url?: string }>} input.players
 *   annuaire `player_scores` (pont nom ↔ id)
 * @param {number} input.horizonDays
 * @param {Date} [input.now]
 */
export function computeBacktest({ priceRows, scoreRows, players, horizonDays, now = new Date() }) {
  const win = backtestWindow(horizonDays, now);

  const playerByName = new Map();
  for (const p of players ?? []) {
    const name = String(p.player_name ?? "").trim().toLowerCase();
    if (name) playerByName.set(name, p);
  }

  // 1. Regroupe les prix par cohorte (même joueur, même type, même grade).
  /** @type {Map<string, Array<{ date: string; price: number }>>} */
  const cohorts = new Map();
  for (const r of priceRows ?? []) {
    if (r.card_type === "ALL") continue;
    const price = Number(r.median_price_cad);
    if (!Number.isFinite(price) || price <= 0) continue;
    const name = String(r.player_name ?? "").trim().toLowerCase();
    const key = `${name}|${r.card_type}|${r.grade}`;
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push({ date: r.snapshot_date, price });
  }

  // 2. Rendement de chaque cohorte : snapshot le plus proche de T → le plus récent.
  /** @type {Map<string, Array<{ ret: number; startDate: string }>>} */
  const returnsByPlayer = new Map();
  for (const [key, rows] of cohorts) {
    const start = rows
      .filter((r) => r.date >= win.startFrom && r.date <= win.startTo)
      .sort((a, b) => distanceDays(a.date, win.targetDate) - distanceDays(b.date, win.targetDate))[0];
    const end = rows
      .filter((r) => r.date >= win.recentFrom)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!start || !end || start.date >= end.date) continue;
    const name = key.split("|")[0];
    if (!returnsByPlayer.has(name)) returnsByPlayer.set(name, []);
    returnsByPlayer.get(name).push({ ret: (end.price / start.price - 1) * 100, startDate: start.date });
  }

  // 3. Score du joueur au moment T (snapshot le plus proche de sa date de départ).
  /** @type {Map<string, Array<{ score: number; date: string }>>} */
  const scoresById = new Map();
  for (const r of scoreRows ?? []) {
    const score = Number(r.score);
    if (!Number.isFinite(score)) continue;
    const id = String(r.player_id);
    if (!scoresById.has(id)) scoresById.set(id, []);
    scoresById.get(id).push({ score, date: r.snapshot_date });
  }

  const points = [];
  for (const [name, rets] of returnsByPlayer) {
    const player = playerByName.get(name);
    if (!player) continue;
    const startDate = rets.map((r) => r.startDate).sort()[0];
    const snap = (scoresById.get(String(player.player_id)) ?? [])
      .filter((s) => distanceDays(s.date, startDate) <= SCORE_MATCH_DAYS)
      .sort((a, b) => distanceDays(a.date, startDate) - distanceDays(b.date, startDate))[0];
    if (!snap) continue;
    points.push({
      playerId: String(player.player_id),
      playerName: player.player_name,
      team: player.team ?? null,
      headshotUrl: player.headshot_url ?? null,
      scoreAtT: round1(snap.score),
      priceChangePct: round1(median(rets.map((r) => r.ret))),
      cohorts: rets.length,
    });
  }

  // 4. Tiers de score (bas / milieu / haut) sur l'échantillon trié.
  points.sort((a, b) => a.scoreAtT - b.scoreAtT || a.playerId.localeCompare(b.playerId));
  const third = Math.floor(points.length / 3);
  const slices = [
    { key: "low", label: "Scores bas", rows: points.slice(0, third) },
    { key: "mid", label: "Scores moyens", rows: points.slice(third, points.length - third) },
    { key: "high", label: "Scores élevés", rows: points.slice(points.length - third) },
  ];
  const tiers = slices.map(({ key, label, rows }) => ({
    key,
    label,
    count: rows.length,
    scoreMin: rows.length ? rows[0].scoreAtT : null,
    scoreMax: rows.length ? rows[rows.length - 1].scoreAtT : null,
    medianChangePct: rows.length ? round1(median(rows.map((r) => r.priceChangePct))) : null,
    pctUp: rows.length ? Math.round((100 * rows.filter((r) => r.priceChangePct > 0).length) / rows.length) : null,
  }));
  for (const p of points) {
    p.tier = slices.find((s) => s.rows.includes(p))?.key ?? "mid";
  }

  const low = tiers[0];
  const high = tiers[2];
  const spreadPts =
    low.medianChangePct != null && high.medianChangePct != null
      ? round1(high.medianChangePct - low.medianChangePct)
      : null;

  const reliable =
    points.length >= MIN_RELIABLE_SAMPLE && tiers.every((t) => t.count >= MIN_RELIABLE_TIER);

  let summary = null;
  if (spreadPts != null && third > 0) {
    if (Math.abs(spreadPts) < FLAT_SPREAD_PTS) {
      summary = "Pas de différence nette entre les cartes des joueurs aux scores élevés et celles des scores bas sur cette période.";
    } else if (spreadPts > 0) {
      summary = `Les cartes des joueurs aux scores élevés ont fait ${spreadPts} points de % de mieux que celles des scores bas.`;
    } else {
      summary = `Les cartes des joueurs aux scores élevés ont fait ${Math.abs(spreadPts)} points de % de MOINS bien que celles des scores bas.`;
    }
  }

  const byChange = [...points].sort((a, b) => b.priceChangePct - a.priceChangePct);

  return {
    horizonDays,
    targetDate: win.targetDate,
    sampleSize: points.length,
    reliable,
    marketMedianPct: points.length ? round1(median(points.map((p) => p.priceChangePct))) : null,
    spreadPts,
    spearman: spearman(points.map((p) => p.scoreAtT), points.map((p) => p.priceChangePct)),
    summary,
    tiers,
    points,
    // Disjoints par construction : une hausse n'est jamais listée comme raté.
    topHigh: byChange.filter((p) => p.tier === "high" && p.priceChangePct > 0).slice(0, 5),
    worstHigh: byChange.filter((p) => p.tier === "high" && p.priceChangePct < 0).reverse().slice(0, 5),
  };
}
