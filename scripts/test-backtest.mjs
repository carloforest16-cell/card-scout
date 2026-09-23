#!/usr/bin/env node
/**
 * Non-régression du calcul de backtest (lib/backtest.js, module pur).
 *
 * Invariant principal : une carte n'est comparée qu'À ELLE-MÊME. Le calcul
 * d'origine moyennait toutes les annonces du joueur aux deux dates — une auto
 * à 500 $ en vente en juillet puis seulement des bases à 5 $ en septembre
 * donnait un faux « −73 % » (Dahlin, mesuré le 2026-09-22).
 *
 * Usage : node scripts/test-backtest.mjs   (ou npm run test:backtest)
 */
import { computeBacktest, spearman } from "../lib/backtest.js";

const NOW = new Date("2026-09-22T12:00:00Z");
const T = "2026-07-24"; // NOW − 60 j
const RECENT = "2026-09-20";

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// --- 1. Le mélange de cartes ne crée pas de faux mouvement -----------------
{
  const players = [{ player_id: 1, player_name: "Rasmus Dahlin" }];
  const priceRows = [
    // Auto présente seulement au départ, base présente aux deux dates (prix stable).
    { player_name: "rasmus dahlin", card_type: "Auto", grade: "Raw", snapshot_date: T, median_price_cad: 500 },
    { player_name: "rasmus dahlin", card_type: "Young Guns", grade: "Raw", snapshot_date: T, median_price_cad: 20 },
    { player_name: "rasmus dahlin", card_type: "Young Guns", grade: "Raw", snapshot_date: RECENT, median_price_cad: 20 },
    // La ligne agrégée « ALL » (mélange) doit être ignorée.
    { player_name: "rasmus dahlin", card_type: "ALL", grade: "Mixed", snapshot_date: T, median_price_cad: 260 },
    { player_name: "rasmus dahlin", card_type: "ALL", grade: "Mixed", snapshot_date: RECENT, median_price_cad: 20 },
  ];
  const scoreRows = [{ player_id: 1, score: 6.9, snapshot_date: T }];
  const r = computeBacktest({ priceRows, scoreRows, players, horizonDays: 60, now: NOW });
  console.log("Mélange de cartes");
  check("un seul joueur retenu", r.sampleSize === 1, `sampleSize=${r.sampleSize}`);
  check("variation = 0 % (même carte, même prix)", r.points[0]?.priceChangePct === 0, `got ${r.points[0]?.priceChangePct}`);
  check("une seule cohorte appariée (l'auto sans point d'arrivée est exclue)", r.points[0]?.cohorts === 1);
}

// --- 2. Variation d'un joueur = médiane de ses cohortes -------------------
{
  const players = [{ player_id: 2, player_name: "Test Player" }];
  const mk = (type, a, b) => [
    { player_name: "test player", card_type: type, grade: "Raw", snapshot_date: T, median_price_cad: a },
    { player_name: "test player", card_type: type, grade: "Raw", snapshot_date: RECENT, median_price_cad: b },
  ];
  const priceRows = [...mk("A", 10, 11), ...mk("B", 10, 12), ...mk("C", 10, 40)]; // +10, +20, +300
  const r = computeBacktest({
    priceRows,
    scoreRows: [{ player_id: 2, score: 5, snapshot_date: T }],
    players,
    horizonDays: 60,
    now: NOW,
  });
  console.log("Médiane des cohortes");
  check("une cohorte explosive ne domine pas (+20 %)", r.points[0]?.priceChangePct === 20, `got ${r.points[0]?.priceChangePct}`);
}

// --- 3. Tiers, écart et fiabilité -----------------------------------------
{
  const players = [];
  const priceRows = [];
  const scoreRows = [];
  for (let i = 0; i < 30; i++) {
    const name = `Joueur ${i}`;
    players.push({ player_id: 100 + i, player_name: name });
    scoreRows.push({ player_id: 100 + i, score: 3 + i * 0.15, snapshot_date: T });
    // Plus le score est haut, plus la carte monte : de −10 % à +19 %.
    priceRows.push(
      { player_name: name.toLowerCase(), card_type: "YG", grade: "Raw", snapshot_date: T, median_price_cad: 100 },
      { player_name: name.toLowerCase(), card_type: "YG", grade: "Raw", snapshot_date: RECENT, median_price_cad: 90 + i }
    );
  }
  const r = computeBacktest({ priceRows, scoreRows, players, horizonDays: 60, now: NOW });
  console.log("Tiers et fiabilité");
  check("30 joueurs", r.sampleSize === 30);
  check("3 tiers de 10", r.tiers.every((t) => t.count === 10), r.tiers.map((t) => t.count).join("/"));
  check("fiable à 30 joueurs / 10 par tiers", r.reliable === true);
  check("scores élevés > scores bas", r.spreadPts > 0, `spread=${r.spreadPts}`);
  check("Spearman = 1 sur une relation monotone", r.spearman === 1, `got ${r.spearman}`);
  check("phrase de verdict positive", /de mieux/.test(r.summary ?? ""), r.summary);

  const small = computeBacktest({
    priceRows: priceRows.slice(0, 40),
    scoreRows,
    players,
    horizonDays: 60,
    now: NOW,
  });
  check("20 joueurs → non fiable", small.sampleSize === 20 && small.reliable === false);
}

// --- 4. Spearman gère les ex æquo -------------------------------------------
console.log("Spearman");
check("relation inverse = −1", spearman([1, 2, 3, 4], [4, 3, 2, 1]) === -1);
check("ex æquo sans NaN", Number.isFinite(spearman([1, 1, 2, 3], [5, 5, 6, 7])));

if (failures > 0) {
  console.log(`\n${failures} échec(s).`);
  process.exit(1);
}
console.log("\nTous les tests du backtest passent.");
