#!/usr/bin/env node
/**
 * Non-régression des filtres d'alertes prix (lib/alertFilters.js, module pur).
 * Usage : node scripts/test-alert-filters.mjs   (ou npm run test:alerts)
 */
import {
  ALERT_CARD_TYPES,
  cardTypeFromGroup,
  describeAlertFilters,
  listingMatchesAlertFilters,
  normalizeAlertFilters,
} from "../lib/alertFilters.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  ÉCHEC"} ${label}${ok ? "" : ` — obtenu ${JSON.stringify(actual)}, attendu ${JSON.stringify(expected)}`}`);
}

console.log("cardTypeFromGroup");
check("Young Guns", cardTypeFromGroup("⭐ Young Guns"), "young_guns");
check("YG Renewed", cardTypeFromGroup("🔄 Young Guns Renewed"), "young_guns");
check("Auto produit", cardTypeFromGroup("✍️ Auto SP Authentic"), "auto");
check("Auto générique", cardTypeFromGroup("✍️ Auto / RPA"), "auto");
check("Numéroté", cardTypeFromGroup("🔢 Numéroté"), "numbered");
check("Patch", cardTypeFromGroup("🎽 Jersey / Patch"), "patch");
check("Canvas = haut de gamme", cardTypeFromGroup("🎨 Canvas"), "premium");
check("Parallèle", cardTypeFromGroup("🌈 Parallèle coloré"), "parallel");
check("Autres", cardTypeFromGroup("📦 Autres cartes"), "base");
check("null", cardTypeFromGroup(null), "base");

console.log("normalizeAlertFilters");
check("vide → aucun filtre", normalizeAlertFilters({}), { card_types: null, condition: "any", min_score: null, keyword: null });
check(
  "types inconnus ignorés, doublons retirés",
  normalizeAlertFilters({ cardTypes: ["auto", "hack", "auto"] }).card_types,
  ["auto"]
);
check(
  "tous les types cochés = aucun filtre",
  normalizeAlertFilters({ cardTypes: ALERT_CARD_TYPES.map((t) => t.id) }).card_types,
  null
);
check("état inconnu → any", normalizeAlertFilters({ condition: "drop table" }).condition, "any");
check("score hors bornes ignoré", normalizeAlertFilters({ minScore: 42 }).min_score, null);
check("score vide ignoré", normalizeAlertFilters({ minScore: "" }).min_score, null);
check("score 7", normalizeAlertFilters({ minScore: "7" }).min_score, 7);
check("mot-clé nettoyé", normalizeAlertFilters({ keyword: "  Series   1 " }).keyword, "Series 1");
check("mot-clé tronqué à 60", normalizeAlertFilters({ keyword: "x".repeat(99) }).keyword.length, 60);

console.log("listingMatchesAlertFilters");
const yg = { title: "2023-24 Upper Deck Series 1 Young Guns #201 Wyatt Johnston", cardType: "young_guns", isGraded: false, score: 7.4 };
const ygPsa = { ...yg, title: yg.title + " PSA 10", isGraded: true };
const base = { title: "2023-24 O-Pee-Chee #12 Wyatt Johnston", cardType: "base", isGraded: false, score: 4.1 };
check("sans filtre : tout passe", listingMatchesAlertFilters(base, {}), true);
check("type YG : base refusée", listingMatchesAlertFilters(base, { card_types: ["young_guns"] }), false);
check("type YG : YG acceptée", listingMatchesAlertFilters(yg, { card_types: ["young_guns"] }), true);
check("non gradées : PSA refusée", listingMatchesAlertFilters(ygPsa, { condition: "raw" }), false);
check("gradées : raw refusée", listingMatchesAlertFilters(yg, { condition: "graded" }), false);
check("gradées : PSA acceptée", listingMatchesAlertFilters(ygPsa, { condition: "graded" }), true);
check("score ≥ 7 : 7.4 passe", listingMatchesAlertFilters(yg, { min_score: 7 }), true);
check("score ≥ 7 : 4.1 refusé", listingMatchesAlertFilters(base, { min_score: 7 }), false);
check("score exigé mais inconnu : refusé", listingMatchesAlertFilters({ ...yg, score: null }, { min_score: 5 }), false);
check("mot-clé multi-mots, ordre libre", listingMatchesAlertFilters(yg, { keyword: "201 series 1" }), true);
check("mot-clé absent", listingMatchesAlertFilters(yg, { keyword: "Canvas" }), false);
check("mot-clé sans accents", listingMatchesAlertFilters({ ...yg, title: "Carte Présentée" }, { keyword: "presentee" }), true);

console.log("describeAlertFilters");
check(
  "résumé",
  describeAlertFilters({ card_types: ["young_guns", "auto"], condition: "raw", min_score: 7, keyword: "Series 1" }),
  ["Young Guns, Autographes", "Non gradées", "Score ≥ 7", "« Series 1 »"]
);
check("aucun filtre", describeAlertFilters({ condition: "any" }), []);

if (failures > 0) {
  console.error(`\n${failures} échec(s).`);
  process.exit(1);
}
console.log("\nTous les tests des filtres d'alertes passent.");
