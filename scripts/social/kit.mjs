/**
 * Kit partagé des visuels réseaux sociaux (images fixes et Reels vidéo) :
 * couleurs, polices, briques satori et chargement des VRAIES données du jour.
 * Polices : Bebas Neue + Barlow (SIL OFL, voir fonts/OFL.txt).
 */
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
const SITE = "https://www.cardmetrics.io";

export const C = {
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

/** Rend un élément satori en PNG. */
export async function renderPng(el, w, hgt, file) {
  const res = new ImageResponse(el, { width: w, height: hgt, fonts: FONTS });
  const buf = Buffer.from(await res.arrayBuffer());
  if (file) writeFileSync(file, buf);
  return buf;
}

/* ─── Mini-JSX pour satori ─────────────────────────────────────────────── */

/** @param {string} type @param {object} style @param {...any} children */
export function h(type, style = {}, ...children) {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  return { type, props: { style: { display: "flex", ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
export const img = (src, w, hgt, style = {}) => ({ type: "img", props: { src, width: w, height: hgt, style } });

export const scoreColor = (s) => (s >= 7.5 ? C.ice : s >= 6 ? C.gold : C.loss);
export const fmt1 = (n) => Number(n).toFixed(1).replace(".", ",");
/** Coupe à un mot entier (jamais « fra… »). */
export function clip(text, max) {
  const t = String(text ?? "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const words = cut.slice(0, cut.lastIndexOf(" ")).split(" ");
  // Jamais finir sur un petit mot vide (« redéfinit la… »).
  while (words.length > 1 && words.at(-1).length <= 3) words.pop();
  return `${words.join(" ").replace(/[\s,;:·-]+$/, "")}…`;
}

/* ─── Briques visuelles ─────────────────────────────────────────────────── */

export function frame({ w, hgt, pad, children, glow = "ice", story = false }) {
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

export function brandBar(dateLabel) {
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

export function footer(disclaimer = true) {
  return h(
    "div",
    { justifyContent: "space-between", alignItems: "flex-end", width: "100%", marginTop: "auto" },
    h("div", { fontSize: 24, color: C.ghost, fontWeight: 500 }, disclaimer ? "Pas un conseil financier" : "100 % gratuit"),
    h("div", { fontFamily: "Bebas", fontSize: 44, color: C.ice, letterSpacing: 2 }, "CARDMETRICS.IO")
  );
}

export function eyebrow(text, color = C.ice) {
  return h(
    "div",
    { alignItems: "center", gap: 14, fontSize: 26, fontWeight: 700, letterSpacing: 5, color },
    h("div", { width: 12, height: 12, borderRadius: 99, background: color }),
    text
  );
}

export function bigTitle(lines, size) {
  return h(
    "div",
    { flexDirection: "column", fontFamily: "Bebas", fontSize: size, lineHeight: 0.92, letterSpacing: 1 },
    lines.map((l) => h("div", { color: l.color ?? C.platinum }, l.text))
  );
}

export function factorBar(label, value, width = 860, { size = 38 } = {}) {
  const color = scoreColor(value);
  return h(
    "div",
    { flexDirection: "column", gap: 10, width },
    h(
      "div",
      { justifyContent: "space-between", alignItems: "baseline", width: "100%" },
      h("span", { fontSize: size, fontWeight: 700 }, label),
      h("span", { fontFamily: "Bebas", fontSize: size * 1.6, color }, `${fmt1(value)}`)
    ),
    h(
      "div",
      { width: "100%", height: 16, borderRadius: 99, background: "rgba(255,255,255,0.08)" },
      h("div", { width: `${Math.max(3, value * 10)}%`, height: 16, borderRadius: 99, background: color })
    )
  );
}

export function scorePill(score, size = 120) {
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

export async function loadData() {
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


/** Valeur d'un facteur du score stocké (0-10). */
export function factor(player, key) {
  const f = player?.data?.factors?.[key];
  return Number(f?.score ?? f);
}

/** « Scores au 22 septembre 2026 » (date locale du rendu). */
export function scoresDateLabel(now = new Date()) {
  return `Scores au ${now.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}`;
}

export const FEED = { w: 1080, hgt: 1350, pad: "72px 80px 64px" };
// Stories/Reels : l'interface TikTok/Instagram couvre le bas (~330 px) et le
// côté droit ; tout le contenu clé reste dans la zone sûre.
export const STORY = { w: 1080, hgt: 1920, pad: "150px 90px 330px", story: true };
