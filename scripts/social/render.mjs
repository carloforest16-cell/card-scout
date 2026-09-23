#!/usr/bin/env node
/**
 * Générateur de visuels Instagram / TikTok à partir des VRAIES données du jour.
 *
 *   node --env-file=.env.local scripts/social/render.mjs
 *
 * Sortie : social-posts/<AAAA-MM-JJ>/ (ignoré par git) — PNG + legendes.md.
 *   - feed-*.png  : 1080×1350 (4:5, format recommandé du fil Instagram)
 *   - story-*.png : 1080×1920 (9:16, Reels / TikTok mode photo / Stories)
 *
 * Règles (CLAUDE.md) : jamais de fausse donnée — tout vient de l'API publique
 * ou de player_scores ; chaque visuel porte sa date et « Pas un conseil
 * financier ». Pas de photo de joueur ni de logo NHL/équipe (propriété de la
 * LNH : risqué dans un contexte promotionnel). Polices : Bebas Neue + Barlow
 * (SIL OFL, voir fonts/OFL.txt).
 */
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const SITE = "https://www.cardmetrics.io";

const C = {
  void: "#05060A",
  panel: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.09)",
  platinum: "#F1F5F9",
  silver: "#CBD5E1",
  ghost: "#8A94A6",
  ice: "#00D4FF",
  gold: "#FFB61E",
  profit: "#22C55E",
  loss: "#F87171",
};

const font = (f) => readFileSync(path.join(HERE, "fonts", f));
const FONTS = [
  { name: "Bebas", data: font("BebasNeue-Regular.ttf"), weight: 400 },
  { name: "Barlow", data: font("Barlow-Regular.ttf"), weight: 400 },
  { name: "Barlow", data: font("Barlow-Medium.ttf"), weight: 500 },
  { name: "Barlow", data: font("Barlow-SemiBold.ttf"), weight: 600 },
  { name: "Barlow", data: font("Barlow-Bold.ttf"), weight: 700 },
  { name: "Barlow", data: font("Barlow-ExtraBold.ttf"), weight: 800 },
];
const LOGO = `data:image/png;base64,${readFileSync(path.join(ROOT, "public/icon-192.png")).toString("base64")}`;

/* ─── Mini-JSX pour satori ─────────────────────────────────────────────── */

/** @param {string} type @param {object} style @param {...any} children */
function h(type, style = {}, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { style: { display: "flex", ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
const img = (src, w, hgt, style = {}) => ({ type: "img", props: { src, width: w, height: hgt, style } });

const scoreColor = (s) => (s >= 7.5 ? C.ice : s >= 6 ? C.gold : C.loss);
const fmt1 = (n) => Number(n).toFixed(1).replace(".", ",");
/** Coupe à un mot entier (jamais « fra… »). */
function clip(text, max) {
  const t = String(text ?? "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:·-]+$/, "")}…`;
}

/* ─── Briques visuelles ─────────────────────────────────────────────────── */

function frame({ w, hgt, pad, children, glow = "ice", story = false }) {
  const g1 = glow === "gold" ? "rgba(255,182,30,0.24)" : "rgba(0,212,255,0.26)";
  return h(
    "div",
    {
      width: w,
      height: hgt,
      position: "relative",
      flexDirection: "column",
      background: C.void,
      color: C.platinum,
      fontFamily: "Barlow",
      padding: pad,
    },
    h("div", {
      position: "absolute",
      inset: 0,
      backgroundImage: `radial-gradient(60% 45% at 85% 8%, ${g1}, transparent 70%), radial-gradient(55% 40% at 5% 100%, rgba(255,182,30,0.14), transparent 70%)`,
    }),
    story ? storyLayout(children) : h("div", { position: "relative", flexDirection: "column", width: "100%", height: "100%" }, children)
  );
}

/**
 * Stories : barre de marque en haut, pied en bas, contenu CENTRÉ verticalement
 * entre les deux (sinon tout se tassait en haut avec un grand vide dessous).
 * Le premier enfant est la barre de marque, le dernier le pied s'il existe.
 */
function storyLayout(children) {
  const kids = children.filter(Boolean);
  const hasFooter = kids.at(-1)?.props?.style?.marginTop === "auto";
  const head = kids[0];
  const foot = hasFooter ? kids.at(-1) : null;
  const body = kids.slice(1, hasFooter ? -1 : undefined);
  return h(
    "div",
    { position: "relative", flexDirection: "column", width: "100%", height: "100%" },
    head,
    h("div", { flex: 1, flexDirection: "column", justifyContent: "center" }, body),
    foot
  );
}

function brandBar(dateLabel) {
  return h(
    "div",
    { alignItems: "center", justifyContent: "space-between", width: "100%" },
    h(
      "div",
      { alignItems: "center", gap: 16 },
      img(LOGO, 58, 58, { borderRadius: 14 }),
      h(
        "div",
        { fontFamily: "Bebas", fontSize: 44, letterSpacing: 2 },
        h("span", { color: C.platinum }, "CARD"),
        h("span", { color: C.ice, marginLeft: 8 }, "METRICS")
      )
    ),
    dateLabel
      ? h(
          "div",
          {
            fontSize: 24,
            fontWeight: 600,
            color: C.silver,
            border: `1px solid ${C.border}`,
            borderRadius: 999,
            padding: "8px 20px",
          },
          dateLabel
        )
      : null
  );
}

function footer(disclaimer = true) {
  return h(
    "div",
    { justifyContent: "space-between", alignItems: "flex-end", width: "100%", marginTop: "auto" },
    h("div", { fontSize: 24, color: C.ghost, fontWeight: 500 }, disclaimer ? "Pas un conseil financier" : "100 % gratuit"),
    h("div", { fontFamily: "Bebas", fontSize: 44, color: C.ice, letterSpacing: 2 }, "CARDMETRICS.IO")
  );
}

function eyebrow(text, color = C.ice) {
  return h(
    "div",
    { alignItems: "center", gap: 14, fontSize: 26, fontWeight: 700, letterSpacing: 5, color },
    h("div", { width: 12, height: 12, borderRadius: 99, background: color }),
    text
  );
}

function bigTitle(lines, size) {
  return h(
    "div",
    { flexDirection: "column", fontFamily: "Bebas", fontSize: size, lineHeight: 0.92, letterSpacing: 1 },
    lines.map((l) => h("div", { color: l.color ?? C.platinum }, l.text))
  );
}

function factorBar(label, value, weightPct, width = 860) {
  const color = scoreColor(value);
  return h(
    "div",
    { flexDirection: "column", gap: 10, width },
    h(
      "div",
      { justifyContent: "space-between", alignItems: "baseline", width: "100%" },
      h(
        "div",
        { alignItems: "baseline", gap: 14 },
        h("span", { fontSize: 38, fontWeight: 700 }, label),
        weightPct ? h("span", { fontSize: 24, color: C.ghost, fontWeight: 500 }, `poids ${weightPct} %`) : null
      ),
      h("span", { fontFamily: "Bebas", fontSize: 60, color }, `${fmt1(value)}`)
    ),
    h(
      "div",
      { width: "100%", height: 16, borderRadius: 99, background: "rgba(255,255,255,0.08)" },
      h("div", { width: `${Math.max(3, value * 10)}%`, height: 16, borderRadius: 99, background: color })
    )
  );
}

function scorePill(score, size = 120) {
  return h(
    "div",
    { alignItems: "baseline", gap: 6 },
    h("span", { fontFamily: "Bebas", fontSize: size, color: scoreColor(score), lineHeight: 1 }, fmt1(score)),
    h("span", { fontFamily: "Bebas", fontSize: size * 0.38, color: C.ghost }, "/10")
  );
}

/* ─── Données réelles ───────────────────────────────────────────────────── */

async function getJson(p) {
  const res = await fetch(`${SITE}${p}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${p} → HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  const [top, rec] = await Promise.all([getJson("/api/opportunites/top"), getJson("/api/recrues")]);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: scored, error } = await db
    .from("player_scores")
    .select("player_id, player_name, team, score, points, games_played, data")
    .in("player_id", ["8478402", "8484801"]);
  if (error) throw new Error(error.message);
  const byId = Object.fromEntries(scored.map((r) => [String(r.player_id), r]));
  const rookies = (rec.rookies ?? [])
    .filter((r) => r.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return {
    top5: (top.opportunities ?? []).slice(0, 5),
    rookies,
    mcdavid: byId["8478402"],
    celebrini: byId["8484801"],
  };
}

/* ─── Visuels ───────────────────────────────────────────────────────────── */

const FEED = { w: 1080, hgt: 1350, pad: "72px 80px 64px" };
// Stories/Reels : l'interface TikTok couvre ~ le bas (350 px) et la droite ;
// tout le contenu clé reste dans la zone sûre (marges généreuses).
const STORY = { w: 1080, hgt: 1920, pad: "150px 90px 330px", story: true };

function feedIntro(date) {
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
      h("span", { fontFamily: "Bebas", fontSize: 76, color: C.ghost, width: 56 }, String(o.rank)),
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
      h("div", { height: 56 }),
      eyebrow("CARD METRICS SCORE"),
      h("div", { height: 18 }),
      bigTitle([{ text: "TOP 5" }, { text: "OPPORTUNITÉS NHL", color: C.ice }], 104),
      h("div", { height: 34 }),
      h("div", { flexDirection: "column", gap: 14 }, d.top5.map(row)),
      footer(true),
    ],
  });
}

function mcdavidFactors(p) {
  const f = p.data?.factors ?? {};
  return [
    { label: "Performance", v: Number(f.performance?.score ?? f.performance), w: 14 },
    { label: "Âge", v: Number(f.age?.score ?? f.age), w: 10 },
    { label: "Upside", v: Number(f.upside?.score ?? f.upside), w: 14 },
  ];
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
      h("div", { flexDirection: "column", gap: 30 }, mcdavidFactors(m).map((x) => factorBar(x.label, x.v, x.w, 920))),
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

const WEIGHTS = [
  ["Performance", 14], ["Upside", 14], ["Momentum", 10], ["Âge", 10], ["Marché", 10],
  ["Accélération", 8], ["Hype", 7], ["Catalyseurs", 6], ["Discrépance", 5], ["Risque", 5],
  ["Liquidité", 4], ["Équipe", 4], ["Buzz", 3],
];

function feedFactors() {
  const max = 14;
  const line = ([label, w]) =>
    h(
      "div",
      { alignItems: "center", gap: 20, width: "100%" },
      h("span", { fontSize: 28, fontWeight: 700, width: 250 }, label),
      h(
        "div",
        { flex: 1, height: 20, borderRadius: 99, background: "rgba(255,255,255,0.06)" },
        h("div", { width: `${(w / max) * 100}%`, height: 20, borderRadius: 99, background: w >= 10 ? C.ice : w >= 6 ? "rgba(0,212,255,0.6)" : "rgba(0,212,255,0.35)" })
      ),
      h("span", { fontFamily: "Bebas", fontSize: 36, width: 80, justifyContent: "flex-end", color: C.silver }, `${w} %`)
    );
  return frame({
    ...FEED,
    children: [
      brandBar(null),
      h("div", { height: 50 }),
      eyebrow("COMMENT ON NOTE UN JOUEUR"),
      h("div", { height: 18 }),
      bigTitle([{ text: "13 FACTEURS." }, { text: "1 SCORE SUR 10.", color: C.ice }], 104),
      h("div", { height: 30 }),
      h("div", { flexDirection: "column", gap: 12, width: "100%" }, WEIGHTS.map(line)),
      footer(false),
    ],
  });
}

/* Carrousel TikTok A — McDavid vs Celebrini */
function storyHook() {
  return frame({
    ...STORY,
    glow: "gold",
    children: [
      brandBar(null),
      eyebrow("CARTES DE HOCKEY", C.gold),
      h("div", { height: 30 }),
      bigTitle([{ text: "LE MEILLEUR" }, { text: "JOUEUR AU MONDE…" }, { text: "MAUVAIS", color: C.gold }, { text: "INVESTISSEMENT ?", color: C.gold }], 150),
      h("div", { height: 50 }),
      h("div", { fontSize: 40, color: C.silver, fontWeight: 600 }, "Glisse →"),
    ],
  });
}

function storyMcDavid(d, date) {
  const m = d.mcdavid;
  return frame({
    ...STORY,
    glow: "gold",
    children: [
      brandBar(date),
      h("div", { fontSize: 54, fontWeight: 800 }, m.player_name),
      h("div", { fontFamily: "Bebas", fontSize: 230, lineHeight: 0.95 }, `${m.points} PTS`),
      h("div", { fontSize: 38, color: C.silver, fontWeight: 600 }, "Meilleur pointeur de la LNH en 2025-26"),
      h("div", { height: 70 }),
      h("div", { fontSize: 40, fontWeight: 700, color: C.ghost }, "Son Card Metrics Score :"),
      scorePill(m.score, 260),
      footer(true),
    ],
  });
}

function storyWhy(d, date) {
  return frame({
    ...STORY,
    glow: "gold",
    children: [
      brandBar(date),
      bigTitle([{ text: "POURQUOI" }, { text: "SI BAS ?", color: C.gold }], 170),
      h("div", { height: 60 }),
      h("div", { flexDirection: "column", gap: 44 }, mcdavidFactors(d.mcdavid).map((x) => factorBar(x.label, x.v, x.w, 900))),
      h("div", { height: 60 }),
      h(
        "div",
        { fontSize: 42, lineHeight: 1.35, color: C.silver, fontWeight: 500, width: 900 },
        "Le score mesure le potentiel de la CARTE, pas le talent. À 29 ans et après 11 saisons, sa valeur est déjà établie."
      ),
      footer(true),
    ],
  });
}

function storyCelebrini(d, date) {
  const c = d.celebrini;
  const f = c.data?.factors ?? {};
  return frame({
    ...STORY,
    children: [
      brandBar(date),
      eyebrow("À L'INVERSE"),
      h("div", { height: 24 }),
      h("div", { fontSize: 58, fontWeight: 800 }, `${c.player_name}, 20 ans`),
      scorePill(c.score, 280),
      h("div", { height: 40 }),
      h(
        "div",
        { flexDirection: "column", gap: 44 },
        factorBar("Âge", Number(f.age?.score ?? f.age), 10, 900),
        factorBar("Upside", Number(f.upside?.score ?? f.upside), 14, 900),
        factorBar("Performance", Number(f.performance?.score ?? f.performance), 14, 900)
      ),
      h("div", { height: 40 }),
      h("div", { fontSize: 40, color: C.silver, fontWeight: 600 }, `${c.points} points à sa 2e saison.`),
      footer(true),
    ],
  });
}

function storyCta(label = "Et ton joueur ?") {
  return frame({
    ...STORY,
    children: [
      brandBar(null),
      bigTitle([{ text: label.toUpperCase() }], 190),
      h("div", { height: 40 }),
      h("div", { fontSize: 46, lineHeight: 1.35, color: C.silver, fontWeight: 500, width: 900 }, "Cherche n'importe quel joueur NHL et vois son score, gratuitement."),
      h("div", { height: 70 }),
      h(
        "div",
        { alignSelf: "flex-start", padding: "30px 50px", borderRadius: 24, background: C.ice, color: C.void, fontFamily: "Bebas", fontSize: 80, letterSpacing: 2 },
        "CARDMETRICS.IO"
      ),
      h("div", { height: 34 }),
      h("div", { fontSize: 36, color: C.ghost, fontWeight: 600 }, "Lien dans la bio · 100 % gratuit"),
    ],
  });
}

/* Carrousel TikTok B — compte à rebours du Top 5 */
function storyTopHook(date) {
  return frame({
    ...STORY,
    children: [
      brandBar(date),
      eyebrow("SELON L'ALGO"),
      h("div", { height: 30 }),
      bigTitle([{ text: "LES 5 CARTES" }, { text: "NHL À SURVEILLER", color: C.ice }, { text: "CET AUTOMNE", color: C.ice }], 172),
      h("div", { height: 50 }),
      h("div", { fontSize: 40, color: C.silver, fontWeight: 600 }, "Le n° 1 va te surprendre →"),
    ],
  });
}

function storyTopItem(o, date) {
  return frame({
    ...STORY,
    children: [
      brandBar(date),
      h("div", { fontFamily: "Bebas", fontSize: 300, color: C.ghost, lineHeight: 0.85 }, `N° ${o.rank}`),
      h("div", { height: 20 }),
      h("div", { fontSize: 76, fontWeight: 800, lineHeight: 1.05 }, o.playerName),
      h("div", { fontSize: 40, color: C.silver, fontWeight: 600 }, `${o.team} · ${o.age} ans`),
      h("div", { height: 40 }),
      scorePill(o.investmentScore, 250),
      h("div", { height: 30 }),
      h("div", { fontSize: 44, lineHeight: 1.3, color: C.platinum, fontWeight: 600, width: 900 }, `« ${o.headline} »`),
      footer(true),
    ],
  });
}

/* ─── Légendes prêtes à publier ─────────────────────────────────────────── */

const TAGS_IG = "#cartesdehockey #hockeycards #nhl #youngguns #upperdeck #collectionneur #hockeycardcollector #cardmetrics";
const TAGS_TT = "#hockeycards #cartesdehockey #nhl #youngguns #cardtok #hockeytok";

function captions(d, date) {
  const t = d.top5;
  const r = d.rookies;
  const m = d.mcdavid;
  const c = d.celebrini;
  return `# Légendes — ${date}

Règle d'or : chaque chiffre vient de Card Metrics à cette date. Si tu publies
plus tard, relance le script pour avoir des visuels et des légendes à jour :
\`node --env-file=.env.local scripts/social/render.mjs\`

## Ordre conseillé (1 publication tous les 2-3 jours)

1. **feed-1-presentation** (épingle-le en haut du profil)
2. **Carrousel TikTok A** (story-A1 → A5) — le plus « viral »
3. **feed-2-top5**
4. **feed-3-mcdavid**
5. **Carrousel TikTok B** (story-B1 → B7)
6. **feed-4-recrues**
7. **feed-5-13-facteurs**

---

## feed-1-presentation (Instagram)

Arrête d'acheter tes cartes de hockey à l'instinct.

Card Metrics note chaque joueur NHL de 0 à 10 (stats + marché eBay) et te dit si une carte vaut son prix : Acheter, Chercher mieux ou Passer.

100 % gratuit, sans compte → lien dans la bio.

${TAGS_IG}

## feed-2-top5 (Instagram)

Le top 5 des joueurs NHL selon le Card Metrics Score cette semaine :

${t.map((o) => `${o.rank}. ${o.playerName} (${o.team}) — ${fmt1(o.investmentScore)}/10`).join("\n")}

Tu en as dans ta collection ? 👇

Scores calculés le ${date.replace("Scores au ", "")}. Pas un conseil financier.

${TAGS_IG}

## feed-3-mcdavid (Instagram)

${m.player_name} : ${m.points} points… et un Card Metrics Score de ${fmt1(m.score)}/10.

Le score mesure le potentiel d'une CARTE, pas le talent du joueur. Production parfaite, mais à 29 ans et après 11 saisons, sa valeur de carte est déjà établie.

${c.player_name}, 20 ans : ${fmt1(c.score)}/10.

D'accord ou pas d'accord ? 👇

Pas un conseil financier.

${TAGS_IG}

## feed-4-recrues (Instagram)

Classe de recrues 2025-26 : les 3 préférées de l'algo.

${r.map((x, i) => `${i + 1}. ${x.fullName} (${x.teamAbbrev}) — ${fmt1(x.score)}/10`).join("\n")}

Toute la cuvée classée sur cardmetrics.io/recrues

Pas un conseil financier.

${TAGS_IG}

## feed-5-13-facteurs (Instagram)

Comment on note un joueur : 13 facteurs, 1 score sur 10.

Performance et potentiel pèsent le plus (14 % chacun), le buzz sur les réseaux le moins (3 %). Tout est expliqué joueur par joueur sur cardmetrics.io.

${TAGS_IG}

---

## Carrousel TikTok A — story-A1 → A5 (mode photo)

**Texte à l'écran (optionnel) :** Le meilleur joueur au monde… mauvais investissement ?

**Légende :**
${m.points} points et seulement ${fmt1(m.score)}/10 ?! Voici pourquoi 👉 Pas un conseil financier.
${TAGS_TT}

Astuce : ajoute un son tendance dans TikTok. Sur Instagram, publie les mêmes images en carrousel, ou fais « Reel → Créer à partir de photos ».

## Carrousel TikTok B — story-B1 → B7 (mode photo)

**Légende :**
Les 5 cartes NHL à surveiller cet automne selon l'algo 🏒 Le n° 1 ? ${t[0].playerName}. Pas un conseil financier.
${TAGS_TT}

---

## Bio suggérée

Card Metrics 🏒 Le score des cartes de hockey NHL
Stats NHL + marché eBay → Acheter / Chercher mieux / Passer
100 % gratuit ↓
cardmetrics.io
`;
}

/* ─── Rendu ─────────────────────────────────────────────────────────────── */

async function render(el, size, file) {
  const res = new ImageResponse(el, { width: size.w, height: size.hgt, fonts: FONTS });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const d = await loadData();
  const now = new Date();
  const date = `Scores au ${now.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}`;
  const out = path.join(ROOT, "social-posts", now.toISOString().slice(0, 10));
  mkdirSync(out, { recursive: true });

  const jobs = [
    ["feed-1-presentation.png", FEED, feedIntro(date)],
    ["feed-2-top5.png", FEED, feedTop5(d, date)],
    ["feed-3-mcdavid.png", FEED, feedMcDavid(d, date)],
    ["feed-4-recrues.png", FEED, feedRookies(d, date)],
    ["feed-5-13-facteurs.png", FEED, feedFactors()],
    ["story-A1-hook.png", STORY, storyHook()],
    ["story-A2-mcdavid.png", STORY, storyMcDavid(d, date)],
    ["story-A3-pourquoi.png", STORY, storyWhy(d, date)],
    ["story-A4-celebrini.png", STORY, storyCelebrini(d, date)],
    ["story-A5-cta.png", STORY, storyCta()],
    ["story-B1-hook.png", STORY, storyTopHook(date)],
    ...[...d.top5].reverse().map((o, i) => [`story-B${i + 2}-numero-${o.rank}.png`, STORY, storyTopItem(o, date)]),
    ["story-B7-cta.png", STORY, storyCta("Et ton joueur ?")],
  ];

  writeFileSync(path.join(out, "legendes.md"), captions(d, date));

  for (const [file, size, el] of jobs) {
    await render(el, size, path.join(out, file));
    console.log("✓", file);
  }
  console.log(`\n${jobs.length} visuels → ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error("[social/render] échec:", err?.message ?? err);
  process.exit(1);
});
