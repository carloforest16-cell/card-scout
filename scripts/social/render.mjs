/**
 * Posts Instagram (images fixes 4:5) sur les VRAIES données du jour.
 * Les Reels vidéo (video.mjs) passent avant : c'est le format que l'algo
 * pousse pour un petit compte ; ces images complètent le profil.
 * Lancé par index.mjs (npm run social).
 *
 * Règles : que des vraies données, date et « Pas un conseil financier » sur
 * chaque visuel, aucune photo de joueur ni logo NHL (propriété de la LNH),
 * aucun chiffre technique qui embrouille (ex. poids des facteurs).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  C,
  FEED,
  bigTitle,
  brandBar,
  clip,
  eyebrow,
  factor,
  factorBar,
  fmt1,
  footer,
  frame,
  h,
  renderPng,
  scoreColor,
  scorePill,
} from "./kit.mjs";

function feedIntro() {
  const verdict = (label, color, text) =>
    h(
      "div",
      { alignItems: "center", gap: 22, padding: "22px 28px", borderRadius: 20, background: C.panel, border: `1px solid ${C.border}` },
      h("div", { width: 18, height: 18, borderRadius: 99, background: color }),
      h("span", { fontFamily: "Bebas", fontSize: 50, color, width: 300 }, label),
      h("span", { fontSize: 30, color: C.silver, fontWeight: 500 }, text)
    );
  return frame({
    ...FEED,
    children: [
      brandBar(null),
      h("div", { height: 90 }),
      eyebrow("CARTES DE HOCKEY NHL"),
      h("div", { height: 28 }),
      bigTitle([{ text: "ARRÊTE D'ACHETER" }, { text: "À L'INSTINCT.", color: C.ice }], 150),
      h("div", { height: 30 }),
      h(
        "div",
        { fontSize: 36, lineHeight: 1.35, color: C.silver, fontWeight: 500, width: 900 },
        "Card Metrics note chaque joueur de 0 à 10 en croisant les stats NHL et le marché eBay, puis te dit si une carte vaut son prix."
      ),
      h("div", { height: 56 }),
      h(
        "div",
        { flexDirection: "column", gap: 18 },
        verdict("ACHETER", C.profit, "Bon joueur, bon prix"),
        verdict("CHERCHER MIEUX", C.gold, "Il y a mieux ailleurs"),
        verdict("PASSER", C.loss, "Trop cher pour ce que c'est")
      ),
      footer(false),
    ],
  });
}

function feedTop5(d, date) {
  const row = (o) =>
    h(
      "div",
      { alignItems: "center", gap: 30, padding: "16px 28px", borderRadius: 20, background: C.panel, border: `1px solid ${C.border}` },
      h("span", { fontFamily: "Bebas", fontSize: 76, color: o.rank === 1 ? C.ice : C.ghost, width: 56 }, String(o.rank)),
      h(
        "div",
        { flexDirection: "column", flex: 1 },
        h("span", { fontSize: 42, fontWeight: 800 }, o.playerName),
        h("span", { fontSize: 26, color: C.silver, fontWeight: 500 }, `${o.team} · ${o.age} ans`),
        h("span", { fontSize: 24, color: C.ghost, fontWeight: 500 }, clip(o.headline, 46))
      ),
      scorePill(o.investmentScore, 92)
    );
  return frame({
    ...FEED,
    children: [
      brandBar(date),
      h("div", { height: 50 }),
      eyebrow("CARD METRICS SCORE"),
      h("div", { height: 16 }),
      bigTitle([{ text: "TOP 5" }, { text: "OPPORTUNITÉS NHL", color: C.ice }], 100),
      h("div", { height: 30 }),
      h("div", { flexDirection: "column", gap: 12 }, d.top5.map(row)),
      footer(true),
    ],
  });
}

function feedMcDavid(d, date) {
  const m = d.mcdavid;
  return frame({
    ...FEED,
    glow: "gold",
    children: [
      brandBar(date),
      h("div", { height: 56 }),
      eyebrow("MEILLEUR JOUEUR ≠ MEILLEURE CARTE", C.gold),
      h("div", { height: 22 }),
      h("div", { fontSize: 46, fontWeight: 800 }, `${m.player_name} · ${m.points} points`),
      h("div", { height: 6 }),
      h(
        "div",
        { alignItems: "baseline", gap: 26 },
        h("span", { fontFamily: "Bebas", fontSize: 150, lineHeight: 1 }, "SCORE :"),
        scorePill(m.score, 190)
      ),
      h("div", { height: 34 }),
      h(
        "div",
        { flexDirection: "column", gap: 30 },
        factorBar("Performance", factor(m, "performance"), 920),
        factorBar("Âge", factor(m, "age"), 920),
        factorBar("Potentiel", factor(m, "upside"), 920)
      ),
      h("div", { height: 34 }),
      h(
        "div",
        { fontSize: 32, lineHeight: 1.35, color: C.silver, fontWeight: 500, width: 920 },
        "Production parfaite. Mais à 29 ans et après 11 saisons, sa valeur de carte est déjà établie : moins de place pour monter."
      ),
      h("div", { height: 22 }),
      h(
        "div",
        { alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 },
        h("span", { color: C.ghost }, "À comparer :"),
        h("span", {}, `${d.celebrini.player_name}, 20 ans →`),
        h("span", { fontFamily: "Bebas", fontSize: 54, color: scoreColor(d.celebrini.score) }, fmt1(d.celebrini.score))
      ),
      footer(true),
    ],
  });
}

function feedRookies(d, date) {
  const card = (r, i) =>
    h(
      "div",
      { flexDirection: "column", gap: 10, padding: "28px 32px", borderRadius: 22, background: C.panel, border: `1px solid ${i === 0 ? "rgba(0,212,255,0.45)" : C.border}` },
      h(
        "div",
        { justifyContent: "space-between", alignItems: "center", width: "100%" },
        h(
          "div",
          { flexDirection: "column" },
          h("span", { fontSize: 26, fontWeight: 700, letterSpacing: 4, color: i === 0 ? C.ice : C.ghost }, `N° ${i + 1}`),
          h("span", { fontSize: 48, fontWeight: 800 }, r.fullName)
        ),
        scorePill(r.score, 110)
      ),
      h("span", { fontSize: 28, color: C.silver, fontWeight: 500 }, `${r.teamAbbrev} · ${r.age} ans · ${r.points} pts en ${r.gamesPlayed} matchs`)
    );
  return frame({
    ...FEED,
    children: [
      brandBar(date),
      h("div", { height: 56 }),
      eyebrow("CLASSE DE RECRUES 2025-26"),
      h("div", { height: 18 }),
      bigTitle([{ text: "LES 3 RECRUES" }, { text: "QUE L'ALGO ADORE", color: C.ice }], 124),
      h("div", { height: 44 }),
      h("div", { flexDirection: "column", gap: 20 }, d.rookies.map(card)),
      footer(true),
    ],
  });
}

// Pas de pourcentages : « ça a pas rapport » pour le public (retour de Carlo,
// 2026-09-23). Trois niveaux qui se lisent en 2 secondes.
const FACTOR_TIERS = [
  { title: "CE QUI PÈSE LE PLUS", color: C.ice, items: ["Performance", "Potentiel"] },
  { title: "CE QUI COMPTE AUSSI", color: "rgba(0,212,255,0.75)", items: ["Momentum", "Âge", "Marché", "Accélération", "Hype", "Catalyseurs"] },
  { title: "LES DÉTAILS", color: C.ghost, items: ["Écart de prix", "Risque", "Liquidité", "Équipe", "Buzz"] },
];

function feedFactors() {
  const chip = (label, color) =>
    h(
      "div",
      { padding: "12px 22px", borderRadius: 999, border: `1px solid ${color}`, fontSize: 30, fontWeight: 700, color: C.platinum },
      label
    );
  return frame({
    ...FEED,
    children: [
      brandBar(null),
      h("div", { height: 56 }),
      eyebrow("COMMENT ON NOTE UN JOUEUR"),
      h("div", { height: 18 }),
      bigTitle([{ text: "13 FACTEURS." }, { text: "1 SCORE SUR 10.", color: C.ice }], 118),
      h("div", { height: 44 }),
      h(
        "div",
        { flexDirection: "column", gap: 34 },
        FACTOR_TIERS.map((t) =>
          h(
            "div",
            { flexDirection: "column", gap: 16 },
            h("span", { fontSize: 26, fontWeight: 700, letterSpacing: 4, color: t.color }, t.title),
            h("div", { flexWrap: "wrap", gap: 14 }, t.items.map((i) => chip(i, t.color)))
          )
        )
      ),
      footer(false),
    ],
  });
}

const TAGS_IG = "#cartesdehockey #hockeycards #nhl #youngguns #upperdeck #collectionneur #hockeycardcollector #cardmetrics";

function feedCaptions(d, date) {
  const t = d.top5;
  const m = d.mcdavid;
  const c = d.celebrini;
  return `# Posts Instagram (images) — ${date}

Les Reels vidéo passent avant (voir reels.md). Ces images complètent le profil.

## post-1-presentation (à épingler en haut du profil)

Arrête d'acheter tes cartes de hockey à l'instinct.

Card Metrics note chaque joueur NHL de 0 à 10 (stats + marché eBay) et te dit si une carte vaut son prix : Acheter, Chercher mieux ou Passer.

100 % gratuit, sans compte → lien dans la bio.

${TAGS_IG}

## post-2-top5

Le top 5 des joueurs NHL selon le Card Metrics Score cette semaine :

${t.map((o) => `${o.rank}. ${o.playerName} (${o.team}) — ${fmt1(o.investmentScore)}/10`).join("\n")}

Tu en as dans ta collection ? 👇

${date}. Pas un conseil financier.

${TAGS_IG}

## post-3-mcdavid

${m.player_name} : ${m.points} points… et un Card Metrics Score de ${fmt1(m.score)}/10.

Le score mesure le potentiel d'une CARTE, pas le talent du joueur. Production parfaite, mais à 29 ans et après 11 saisons, sa valeur de carte est déjà établie.

${c.player_name}, 20 ans : ${fmt1(c.score)}/10.

D'accord ou pas d'accord ? 👇

Pas un conseil financier.

${TAGS_IG}

## post-4-recrues

Classe de recrues 2025-26 : les 3 préférées de l'algo.

${d.rookies.map((x, i) => `${i + 1}. ${x.fullName} (${x.teamAbbrev}) — ${fmt1(x.score)}/10`).join("\n")}

Toute la cuvée classée sur cardmetrics.io/recrues

Pas un conseil financier.

${TAGS_IG}

## post-5-13-facteurs

Comment on note un joueur : 13 facteurs, 1 score sur 10.

La performance et le potentiel comptent le plus ; le buzz sur les réseaux, le moins. Tout est expliqué joueur par joueur sur cardmetrics.io.

${TAGS_IG}

## Bio suggérée

Card Metrics 🏒 Le score des cartes de hockey NHL
Stats NHL + marché eBay → Acheter / Chercher mieux / Passer
100 % gratuit ↓
cardmetrics.io
`;
}

/**
 * @param {object} d données de loadData()
 * @param {string} out dossier de sortie
 * @param {string} date libellé « Scores au … »
 */
export async function renderFeed(d, out, date) {
  writeFileSync(path.join(out, "posts.md"), feedCaptions(d, date));
  const jobs = [
    ["post-1-presentation.png", feedIntro()],
    ["post-2-top5.png", feedTop5(d, date)],
    ["post-3-mcdavid.png", feedMcDavid(d, date)],
    ["post-4-recrues.png", feedRookies(d, date)],
    ["post-5-13-facteurs.png", feedFactors()],
  ];
  for (const [file, el] of jobs) {
    await renderPng(el, FEED.w, FEED.hgt, path.join(out, file));
    console.log("✓", file);
  }
}
