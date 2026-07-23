#!/usr/bin/env node
/**
 * Harnais de non-régression des COHORTES de prix (tâche 0.1 de PLAN-HOTTEST-DEALS.md).
 *
 * Objectif : figer, sur des titres eBay RÉELS, deux invariants qui font tout le
 * sérieux des cotes affichées sur /deals :
 *   1. Deux VARIANTES différentes d'une même carte (Young Guns vs Young Guns
 *      Retro / Canvas / Deluxe) ne partagent JAMAIS la même clé de cohorte —
 *      sinon la cote de l'une est empruntée à l'autre (bug B1 : la Carlsson
 *      Retro affichée « −81 % » avec la cote d'une YG régulière).
 *   2. Le junk (packs, lots, customs / art) est exclu par les filtres PURS.
 *
 * Contraintes d'import (même pattern que scripts/smoke.mjs) : ce script tourne
 * sous `node` nu, il ne peut donc importer QUE des modules purs — pas de
 * `import "server-only"`, pas d'alias `@/…`. Les deux modules purs concernés :
 *   - lib/cardNumberExtractor.js  → extractCardFingerprint().cohortKey
 *   - lib/titleFilters.js         → isPackOrLotTitle, (à venir) CUSTOM_ART_RE
 * `cohortKeyForTitle` (lib/dealFinder.js) est server-only, mais sa source de
 * vérité est `extractCardFingerprint().cohortKey` — c'est donc CE champ qu'on
 * teste, au plus près du bug.
 *
 * Sémantique XFAIL (comme pytest) : un cas marqué `expectedFail: true` documente
 * un bug CONNU pas encore corrigé. Il échoue aujourd'hui — c'est attendu, ça ne
 * casse pas la CI. Quand la tâche qui le corrige atterrit, le cas passe au vert
 * (« XPASS ») : le harnais le signale bruyamment pour qu'on retire le flag et
 * qu'il devienne un vrai test dur. Seul un cas NON-expectedFail qui échoue fait
 * sortir le script en code 1 (échec CI réel).
 *
 * Usage : node scripts/test-cohorts.mjs   (ou npm run test:cohorts)
 */

import { extractCardFingerprint } from "../lib/cardNumberExtractor.js";
import * as titleFilters from "../lib/titleFilters.js";

/** Clé de cohorte d'un titre (chaîne, ou "NULL" si l'empreinte échoue). */
function cohort(title, knownLastName = null) {
  return extractCardFingerprint(title, knownLastName)?.cohortKey ?? "NULL";
}

/**
 * Prédicat d'exclusion PUR : ce qu'on peut prouver sans le pipeline server-only.
 * - packs / lots : PACK_BOX_RE (source unique titleFilters.js)
 * - customs / art : CUSTOM_ART_RE (créée en tâche 2.1, même source unique).
 * L'accès via namespace (`titleFilters.X`) reste robuste si un export venait à
 * manquer (undefined plutôt que SyntaxError au chargement).
 */
function isExcludedPure(title) {
  if (titleFilters.isPackOrLotTitle(title)) return true;
  const customRe = titleFilters.CUSTOM_ART_RE;
  if (customRe instanceof RegExp && customRe.test(title)) return true;
  return false;
}

/* ─── Fixtures ──────────────────────────────────────────────────────────────
 * Chaque cas : { kind, ...données, expect, expectedFail?, note }.
 * kind :
 *   "cohort-differ" — cohort(a) !== cohort(b)        (variantes distinctes)
 *   "cohort-equal"  — cohort(a) === expect           (valeur figée)
 *   "exclude"       — isExcludedPure(title) === true
 *   "keep"          — isExcludedPure(title) === false
 *   "player-match"  — titleMatchesPlayer(name, title) === expect
 * ------------------------------------------------------------------------- */

const CASES = [
  // ── B1 : variantes Young Guns qui NE DOIVENT PAS partager la cohorte de base.
  //    Elles s'effondrent aujourd'hui sur « <nom>-<année>-young-guns » (bug).
  {
    kind: "cohort-differ",
    note: "B1 · Young Guns Retro ≠ Young Guns régulière",
    a: "2023-24 Upper Deck Extended Leo Carlsson Young Guns Retro",
    b: "2023-24 Upper Deck Series 1 Leo Carlsson Young Guns #452",
    ln: "Leo Carlsson",
  },
  {
    kind: "cohort-differ",
    note: "B1 · Young Guns Canvas ≠ Young Guns régulière",
    a: "2023-24 Upper Deck Leo Carlsson Young Guns Canvas #C452",
    b: "2023-24 Upper Deck Series 1 Leo Carlsson Young Guns #452",
    ln: "Leo Carlsson",
  },
  {
    kind: "cohort-differ",
    note: "B1 · Young Guns Deluxe ≠ Young Guns régulière",
    a: "2023-24 Upper Deck Leo Carlsson Young Guns Deluxe",
    b: "2023-24 Upper Deck Series 1 Leo Carlsson Young Guns #452",
    ln: "Leo Carlsson",
  },

  // ── Variantes DÉJÀ correctement séparées (parallelTag dans la cohortKey).
  //    Ces cas passent aujourd'hui — ils verrouillent qu'on ne les casse pas
  //    en corrigeant B1.
  {
    kind: "cohort-differ",
    note: "Young Guns Outburst déjà distincte (ne pas régresser)",
    a: "2023-24 Upper Deck Leo Carlsson Young Guns Outburst",
    b: "2023-24 Upper Deck Series 1 Leo Carlsson Young Guns #452",
    ln: "Leo Carlsson",
  },
  {
    kind: "cohort-differ",
    note: "Young Guns Exclusives déjà distincte (ne pas régresser)",
    a: "2023-24 Upper Deck Leo Carlsson Young Guns Exclusives",
    b: "2023-24 Upper Deck Series 1 Leo Carlsson Young Guns #452",
    ln: "Leo Carlsson",
  },
  {
    kind: "cohort-differ",
    note: "Grade PSA 10 distinct de la YG raw (ne pas régresser)",
    a: "2023-24 Upper Deck Connor Bedard Young Guns PSA 10 Gem Mint",
    b: "2023-24 Upper Deck Connor Bedard Young Guns",
    ln: "Connor Bedard",
  },

  // ── B2 (indirect) : autos de sets différents = cohortes différentes.
  //    Verrouille que le repli élargi (tâche 1.2) ne les refusionnera pas.
  {
    kind: "cohort-differ",
    note: "B2 · auto MVP ≠ auto SP Authentic Future Watch",
    a: "Nick Suzuki 2022-23 Upper Deck MVP Signed Auto",
    b: "Nick Suzuki 2021-22 SP Authentic Future Watch Auto",
    ln: "Nick Suzuki",
  },

  // ── Valeurs de cohorte FIGÉES (régression fine).
  {
    kind: "cohort-equal",
    note: "Garde anti-saison : « 2024-25 » n'est pas un tirage /25",
    a: "2024-25 Upper Deck Macklin Celebrini Young Guns",
    ln: "Macklin Celebrini",
    expect: "celebrini-2024-25-young-guns",
  },
  {
    kind: "cohort-equal",
    note: "Vrai tirage /25 conservé sur une variante",
    a: "2023-24 Upper Deck Leo Carlsson Young Guns Outburst /25",
    ln: "Leo Carlsson",
    expect: "carlsson-2023-24-young-guns-outburst-/25",
  },
  {
    kind: "cohort-equal",
    note: "« Gold Medal » (Team Canada) n'est pas un parallèle Gold",
    a: "2023-24 Team Canada Gold Medal Connor Bedard Young Guns",
    ln: "Connor Bedard",
    expect: "bedard-2023-24-young-guns",
  },
  {
    kind: "cohort-equal",
    note: "« New Jersey » (équipe) ne pollue pas la cohorte",
    a: "New Jersey Devils Jack Hughes 2019-20 Young Guns",
    ln: "Jack Hughes",
    expect: "hughes-2019-20-young-guns",
  },

  // ── B3 : customs / art à exclure. Aucun prédicat pur ne les attrape encore
  //    (CUSTOM_ART_RE créée en tâche 2.1) → expectedFail jusque-là.
  {
    kind: "exclude",
    note: "B3 · Artist Signed custom 1/1",
    title: 'Ivan Demidov Limited Artist Signed "Montreal Canadiens" 1/1',
  },
  {
    kind: "exclude",
    note: "B3 · carte ACEO custom art",
    title: "Connor Bedard ACEO Custom Art Card Hockey",
  },
  {
    kind: "exclude",
    note: "B3 · sketch card peinte à la main",
    title: "Connor McDavid Hand Painted Sketch Card 1/1 Original Art",
  },
  {
    kind: "exclude",
    note: "B3 · carte altérée / repaint",
    title: "Sidney Crosby Altered Repaint Custom 1 of 1",
  },

  // ── Junk DÉJÀ exclu (packs / lots) — régression, doit rester vert.
  {
    kind: "exclude",
    note: "Pack scellé Hobby Box",
    title: "2023-24 Upper Deck Series 1 Hockey Hobby Box Factory Sealed",
  },
  {
    kind: "exclude",
    note: "Lot multi-cartes",
    title: "Connor Bedard 5 cards lot Young Guns rookies",
  },
  {
    kind: "exclude",
    note: "Quantité en tête de titre (3)",
    title: "(3) Connor McDavid Young Guns Rookie Cards",
  },

  // ── Faux positifs à PROTÉGER (ne jamais exclure une vraie carte).
  {
    kind: "keep",
    note: "Slab PSA 10 « Sealed » (sans Pack/Box/Case) ≠ pack scellé",
    title: "Connor Bedard 2023-24 Young Guns PSA 10 Gem Mint Sealed",
  },
  {
    kind: "keep",
    note: "Vraie auto (Signed sans contexte art) reste valide",
    title: "Nick Suzuki 2019-20 SP Authentic Future Watch Auto Signed",
  },
  {
    kind: "keep",
    note: "Young Guns régulière ne doit jamais être exclue",
    title: "2023-24 Upper Deck Leo Carlsson Young Guns #452",
  },

  // ── titleMatchesPlayer (source titleFilters.js) — accents & frères.
  {
    kind: "player-match",
    note: "Frères Hughes : Jack ≠ Quinn",
    name: "Jack Hughes",
    title: "Quinn Hughes 2019-20 Young Guns",
    expect: false,
  },
  {
    kind: "player-match",
    note: "Accent : Stützle == Stutzle",
    name: "Tim Stützle",
    title: "Tim Stutzle 2020-21 Young Guns",
    expect: true,
  },
];

/* ─── Runner ────────────────────────────────────────────────────────────── */

/** @param {(typeof CASES)[number]} c → { pass, detail } */
function runCase(c) {
  switch (c.kind) {
    case "cohort-differ": {
      const ka = cohort(c.a, c.ln);
      const kb = cohort(c.b, c.ln);
      return {
        pass: ka !== kb,
        detail: ka !== kb ? `${ka} ≠ ${kb}` : `MÊME cohorte : ${ka}`,
      };
    }
    case "cohort-equal": {
      const ka = cohort(c.a, c.ln);
      return { pass: ka === c.expect, detail: `${ka} (attendu ${c.expect})` };
    }
    case "exclude": {
      const ex = isExcludedPure(c.title);
      return { pass: ex === true, detail: ex ? "exclu" : "NON exclu" };
    }
    case "keep": {
      const ex = isExcludedPure(c.title);
      return { pass: ex === false, detail: ex ? "exclu à tort" : "conservé" };
    }
    case "player-match": {
      const got = titleFilters.titleMatchesPlayer(c.name, c.title);
      return { pass: got === c.expect, detail: `${got} (attendu ${c.expect})` };
    }
    default:
      return { pass: false, detail: `kind inconnu : ${c.kind}` };
  }
}

function main() {
  console.log("Test cohortes — PLAN-HOTTEST-DEALS.md tâche 0.1\n");
  let hardFail = 0;
  let xfail = 0;
  let xpass = 0;
  let ok = 0;

  for (const c of CASES) {
    const { pass, detail } = runCase(c);
    let icon, tag;
    if (pass && !c.expectedFail) {
      icon = "✓"; tag = ""; ok++;
    } else if (!pass && c.expectedFail) {
      icon = "⚠"; tag = " [XFAIL attendu]"; xfail++;
    } else if (pass && c.expectedFail) {
      icon = "★"; tag = " [XPASS — corrigé ! retirer expectedFail]"; xpass++;
    } else {
      icon = "✗"; tag = " [ÉCHEC]"; hardFail++;
    }
    console.log(`${icon} ${String(c.note).padEnd(52)} ${detail}${tag}`);
  }

  console.log(
    `\n${ok} OK · ${xfail} échecs attendus (XFAIL) · ${xpass} corrigés (XPASS) · ${hardFail} échecs réels`
  );
  if (xpass > 0) {
    console.log(
      "★ Des cas expectedFail passent maintenant : retire leur flag pour les figer en tests durs."
    );
  }
  if (hardFail > 0) {
    console.error(`\n${hardFail} échec(s) réel(s) — régression de cohorte/filtre.`);
    process.exit(1);
  }
}

main();
