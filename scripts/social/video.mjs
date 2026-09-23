/**
 * Reels / TikTok VIDÉO (MP4 9:16, 30 i/s) sur les VRAIES données du jour.
 * Format prioritaire : l'algo pousse la vidéo bien plus que les photos pour
 * un petit compte (retour de Carlo, 2026-09-23).
 *
 * Principe : chaque image de la vidéo est dessinée avec satori (même kit que
 * les posts), puis ffmpeg (dépendance de dev ffmpeg-static) assemble le MP4.
 * Pas de musique intégrée : ajouter un son tendance DANS l'app (TikTok /
 * Instagram) aide beaucoup plus la portée qu'une piste fixe. Une piste
 * silencieuse est incluse pour la compatibilité des plateformes.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

import {
  C,
  STORY,
  brandBar,
  eyebrow,
  factor,
  fmt1,
  footer,
  frame,
  h,
  renderPng,
  scoreColor,
} from "./kit.mjs";

const FPS = 30;
// Rythme : retour de Carlo (2026-09-23) — « on n'a pas le temps de lire ».
// Chaque écran reste affiché au moins ~2,5 s APRÈS l'arrivée de son dernier
// texte ; les animations d'entrée sont un peu plus douces.

/* ─── Animation ─────────────────────────────────────────────────────────── */

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Apparition en montant (texte). */
function rise(t, at, dur = 0.5, dist = 60) {
  const p = easeOut(clamp01((t - at) / dur));
  return { opacity: p, transform: `translateY(${Math.round((1 - p) * dist)}px)` };
}

/** Apparition « coup de poing » (gros chiffres, rangs). */
function pop(t, at, dur = 0.55) {
  const x = clamp01((t - at) / dur);
  const s = 0.55 + 0.45 * easeBack(x);
  return { opacity: clamp01(x * 3), transform: `scale(${x === 0 ? 0.55 : s.toFixed(3)})`, transformOrigin: "left center" };
}

/** Valeur qui défile de 0 à `to`. */
const count = (t, at, dur, to) => to * easeOut(clamp01((t - at) / dur));

/* ─── Briques animées ───────────────────────────────────────────────────── */

function animatedScore(t, at, score, size) {
  const v = count(t, at, 1.4, score);
  return h(
    "div",
    { alignItems: "baseline", gap: 8, ...pop(t, at) },
    h("span", { fontFamily: "Bebas", fontSize: size, color: scoreColor(score), lineHeight: 1 }, fmt1(v)),
    h("span", { fontFamily: "Bebas", fontSize: size * 0.36, color: C.ghost }, "/10")
  );
}

function animatedBar(t, at, label, value) {
  const v = count(t, at, 1.2, value);
  const color = scoreColor(value);
  return h(
    "div",
    { flexDirection: "column", gap: 12, width: 900, ...rise(t, at, 0.35, 30) },
    h(
      "div",
      { justifyContent: "space-between", alignItems: "baseline", width: "100%" },
      h("span", { fontSize: 46, fontWeight: 700 }, label),
      h("span", { fontFamily: "Bebas", fontSize: 76, color }, fmt1(v))
    ),
    h(
      "div",
      { width: "100%", height: 20, borderRadius: 99, background: "rgba(255,255,255,0.08)" },
      h("div", { width: `${Math.max(2, v * 10)}%`, height: 20, borderRadius: 99, background: color })
    )
  );
}

function titleLines(t, lines, size, start = 0, step = 0.22) {
  return h(
    "div",
    { flexDirection: "column", fontFamily: "Bebas", fontSize: size, lineHeight: 0.92, letterSpacing: 1 },
    lines.map((l, i) => h("div", { color: l.color ?? C.platinum, ...rise(t, start + (l.at ?? i * step), 0.35, 70) }, l.text))
  );
}

function ctaScene(t, title) {
  return [
    titleLines(t, [{ text: title }], 190),
    h("div", { height: 40 }),
    h("div", { fontSize: 46, lineHeight: 1.35, color: C.silver, fontWeight: 500, width: 900, ...rise(t, 0.35) }, "Cherche n'importe quel joueur NHL et vois son score, gratuitement."),
    h("div", { height: 60 }),
    h(
      "div",
      { alignSelf: "flex-start", padding: "30px 50px", borderRadius: 24, background: C.ice, color: C.void, fontFamily: "Bebas", fontSize: 84, letterSpacing: 2, ...pop(t, 0.7) },
      "CARDMETRICS.IO"
    ),
    h("div", { height: 34 }),
    h("div", { fontSize: 38, color: C.ghost, fontWeight: 600, ...rise(t, 1.0) }, "Lien dans la bio · 100 % gratuit"),
  ];
}

/* ─── Reels ─────────────────────────────────────────────────────────────── */

/** Reel 1 — « Le meilleur joueur au monde… mauvais investissement ? » */
function reelMcDavid(d) {
  const m = d.mcdavid;
  const c = d.celebrini;
  return [
    {
      dur: 3.6,
      glow: "gold",
      draw: (t) => [
        eyebrow("CARTES DE HOCKEY", C.gold),
        h("div", { height: 30 }),
        // 1re image = miniature qui doit arrêter le défilement : le début de
        // l'accroche est visible dès t = 0, seule la chute arrive en animation.
        titleLines(t, [
          { text: "LE MEILLEUR", at: -1 },
          { text: "JOUEUR AU MONDE…", at: -1 },
          { text: "MAUVAIS", color: C.gold, at: 0.55 },
          { text: "INVESTISSEMENT ?", color: C.gold, at: 0.8 },
        ], 150),
      ],
    },
    {
      dur: 4.0,
      glow: "gold",
      draw: (t) => [
        h("div", { fontSize: 64, fontWeight: 800, ...rise(t, 0) }, m.player_name),
        h("div", { fontFamily: "Bebas", fontSize: 260, lineHeight: 0.95, ...pop(t, 0.2) }, `${Math.round(count(t, 0.2, 1.2, m.points))} PTS`),
        h("div", { fontSize: 42, color: C.silver, fontWeight: 600, ...rise(t, 1.5) }, "Meilleur pointeur de la LNH en 2025-26"),
      ],
    },
    {
      dur: 3.6,
      glow: "gold",
      draw: (t) => [
        h("div", { fontSize: 52, fontWeight: 700, color: C.ghost, ...rise(t, 0) }, "Son Card Metrics Score :"),
        h("div", { height: 10 }),
        animatedScore(t, 0.35, m.score, 330),
      ],
    },
    {
      dur: 6.5,
      glow: "gold",
      draw: (t) => [
        titleLines(t, [{ text: "POURQUOI" }, { text: "SI BAS ?", color: C.gold }], 170),
        h("div", { height: 60 }),
        h(
          "div",
          { flexDirection: "column", gap: 48 },
          animatedBar(t, 0.7, "Performance", factor(m, "performance")),
          animatedBar(t, 1.4, "Âge", factor(m, "age")),
          animatedBar(t, 2.1, "Potentiel", factor(m, "upside"))
        ),
        h("div", { height: 56 }),
        h(
          "div",
          { fontSize: 44, lineHeight: 1.3, color: C.silver, fontWeight: 600, width: 900, ...rise(t, 3.1) },
          "29 ans, 11 saisons : sa valeur de carte est déjà établie."
        ),
      ],
    },
    {
      dur: 5.2,
      draw: (t) => [
        h("div", rise(t, 0, 0.3), eyebrow("À L'INVERSE")),
        h("div", { height: 24 }),
        h("div", { fontSize: 62, fontWeight: 800, ...rise(t, 0.1) }, `${c.player_name}, 20 ans`),
        animatedScore(t, 0.4, c.score, 300),
        h("div", { height: 40 }),
        h(
          "div",
          { flexDirection: "column", gap: 44 },
          animatedBar(t, 1.6, "Âge", factor(c, "age")),
          animatedBar(t, 2.2, "Potentiel", factor(c, "upside"))
        ),
      ],
    },
    { dur: 4.2, cta: true, draw: (t) => ctaScene(t, "ET TON JOUEUR ?") },
  ];
}

/** Reel 2 — compte à rebours du Top 5. */
function reelTop5(d) {
  const item = (o, dur) => ({
    dur,
    glow: o.rank === 1 ? "gold" : "ice",
    draw: (t) => [
      h("div", { fontFamily: "Bebas", fontSize: 300, lineHeight: 0.85, color: o.rank === 1 ? C.gold : C.ghost, ...pop(t, 0, 0.4) }, `N° ${o.rank}`),
      h("div", { height: 24 }),
      h("div", { fontSize: 80, fontWeight: 800, lineHeight: 1.05, ...rise(t, 0.25) }, o.playerName),
      h("div", { fontSize: 42, color: C.silver, fontWeight: 600, ...rise(t, 0.4) }, `${o.team} · ${o.age} ans`),
      h("div", { height: 30 }),
      animatedScore(t, 0.55, o.investmentScore, 250),
      h("div", { height: 24 }),
      h("div", { fontSize: 44, lineHeight: 1.3, fontWeight: 600, width: 900, ...rise(t, 1.2) }, `« ${o.headline} »`),
    ],
  });
  return [
    {
      dur: 3.8,
      draw: (t) => [
        eyebrow("SELON L'ALGO"),
        h("div", { height: 30 }),
        titleLines(t, [
          { text: "5 CARTES NHL", at: -1 },
          { text: "À SURVEILLER", color: C.ice, at: -1 },
          { text: "CET AUTOMNE", color: C.ice, at: 0.45 },
        ], 180),
        h("div", { height: 40 }),
        h("div", { fontSize: 44, color: C.silver, fontWeight: 600, ...rise(t, 1.1) }, "Le n° 1 va te surprendre"),
      ],
    },
    ...[...d.top5].reverse().map((o) => item(o, o.rank === 1 ? 4.8 : 4.0)),
    { dur: 4.2, cta: true, draw: (t) => ctaScene(t, "ET TON JOUEUR ?") },
  ];
}

/** Reel 3 — les 3 recrues que l'algo adore. */
function reelRookies(d) {
  return [
    {
      dur: 3.6,
      draw: (t) => [
        eyebrow("CLASSE DE RECRUES 2025-26"),
        h("div", { height: 30 }),
        titleLines(t, [
          { text: "LES 3 RECRUES", at: -1 },
          { text: "QUE L'ALGO", color: C.ice, at: -1 },
          { text: "ADORE", color: C.ice, at: 0.45 },
        ], 190),
      ],
    },
    ...[...d.rookies].reverse().map((r, idx, arr) => {
      const rank = arr.length - idx;
      return {
        dur: rank === 1 ? 4.6 : 4.0,
        glow: rank === 1 ? "gold" : "ice",
        draw: (t) => [
          h("div", { fontFamily: "Bebas", fontSize: 280, lineHeight: 0.85, color: rank === 1 ? C.gold : C.ghost, ...pop(t, 0, 0.4) }, `N° ${rank}`),
          h("div", { height: 24 }),
          h("div", { fontSize: 80, fontWeight: 800, ...rise(t, 0.25) }, r.fullName),
          h("div", { fontSize: 42, color: C.silver, fontWeight: 600, ...rise(t, 0.4) }, `${r.teamAbbrev} · ${r.age} ans`),
          h("div", { height: 30 }),
          animatedScore(t, 0.55, r.score, 260),
          h("div", { height: 24 }),
          h("div", { fontSize: 46, fontWeight: 700, ...rise(t, 1.2) }, `${r.points} points en ${r.gamesPlayed} matchs`),
        ],
      };
    }),
    { dur: 4.2, cta: true, draw: (t) => ctaScene(t, "ET TON JOUEUR ?") },
  ];
}

/* ─── Rendu vidéo ───────────────────────────────────────────────────────── */

function sceneFrame(scene, t, date) {
  return frame({
    ...STORY,
    glow: scene.glow ?? "ice",
    children: [brandBar(scene.cta ? null : date), ...scene.draw(t), scene.cta ? null : footer(true)],
  });
}

/**
 * Rend un Reel en MP4 + une image de couverture (dernière image du 1er plan).
 * @returns {Promise<number>} durée en secondes
 */
async function renderReel(scenes, date, outFile, coverFile) {
  const tmp = mkdtempSync(path.join(tmpdir(), "cm-reel-"));
  try {
    let n = 0;
    for (const scene of scenes) {
      const frames = Math.round(scene.dur * FPS);
      for (let i = 0; i < frames; i++) {
        const buf = await renderPng(sceneFrame(scene, i / FPS, date), STORY.w, STORY.hgt);
        writeFileSync(path.join(tmp, `f${String(n++).padStart(5, "0")}.png`), buf);
      }
    }
    const hook = scenes[0];
    await renderPng(sceneFrame(hook, hook.dur, date), STORY.w, STORY.hgt, coverFile);
    execFileSync(
      ffmpegPath,
      [
        "-y", "-loglevel", "error",
        "-framerate", String(FPS), "-i", path.join(tmp, "f%05d.png"),
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart", outFile,
      ],
      { stdio: "inherit" }
    );
    return n / FPS;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const TAGS = "#hockeycards #cartesdehockey #nhl #youngguns #cardtok #hockeytok #hockeycardcollector";

function reelCaptions(d, date) {
  const m = d.mcdavid;
  return `# Reels / TikTok (vidéo) — ${date}

Format prioritaire. Publie la MÊME vidéo sur TikTok ET en Reel Instagram.

**Avant de publier :** ajoute un son tendance dans l'app (bibliothèque de
sons TikTok / Instagram), c'est ce qui aide le plus la portée. Choisis
« reel-X-couverture.png » comme couverture (Instagram : « Modifier la
couverture »).

## reel-1-mcdavid.mp4 (à publier en premier)

**Texte d'accroche (dans l'app, optionnel) :** ${m.points} points… et seulement ${fmt1(m.score)}/10 ?!

**Légende :**
Le meilleur joueur au monde, mauvais investissement ? Le Card Metrics Score juge la CARTE, pas le talent. Ton avis ? 👇
Pas un conseil financier.
${TAGS}

## reel-2-top5.mp4

**Légende :**
Les 5 cartes NHL à surveiller cet automne selon l'algo 🏒 Le n° 1 ? ${d.top5[0].playerName}. Tu en as un dans ta collection ?
Pas un conseil financier.
${TAGS}

## reel-3-recrues.mp4

**Légende :**
Les 3 recrues 2025-26 que l'algo adore : ${d.rookies.map((r) => r.fullName).join(", ")}. D'accord avec le classement ? 👇
Pas un conseil financier.
${TAGS}

## Rythme conseillé

1 Reel tous les 2-3 jours, à 18 h-21 h (heure de l'Est). Réponds à tous les
commentaires dans la première heure : c'est ce qui lance la diffusion.
`;
}

/**
 * @param {object} d données de loadData()
 * @param {string} out dossier de sortie
 * @param {string} date libellé « Scores au … »
 */
export async function renderReels(d, out, date) {
  writeFileSync(path.join(out, "reels.md"), reelCaptions(d, date));
  const reels = [
    ["reel-1-mcdavid", reelMcDavid(d)],
    ["reel-2-top5", reelTop5(d)],
    ["reel-3-recrues", reelRookies(d)],
  ];
  for (const [name, scenes] of reels) {
    const started = Date.now();
    const secs = await renderReel(scenes, date, path.join(out, `${name}.mp4`), path.join(out, `${name}-couverture.png`));
    console.log(`✓ ${name}.mp4 (${secs.toFixed(1)} s, rendu en ${Math.round((Date.now() - started) / 1000)} s)`);
  }
}
