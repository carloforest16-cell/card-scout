#!/usr/bin/env node
/**
 * Smoke tests (tâche 6.3 du plan) — filet de sécurité rapide pour la loop.
 * Fetch ~12 routes clés (pages SSR + APIs publiques) contre un serveur local
 * et vérifie un status 200 + un marqueur de contenu attendu par route.
 *
 * Usage : npm run smoke        → cible locale (défaut localhost:3001)
 *         npm run smoke:prod   → cible https://www.cardmetrics.io
 *         SMOKE_BASE_URL=… npm run smoke
 *
 * Le défaut reste LOCAL à dessein : ce script est le filet de la loop de dev, et
 * un défaut « prod » ferait passer une vérification locale pour une
 * vérification de production. La cible est donc annoncée en tête ET dans la
 * ligne de résumé, avec un avertissement explicite quand elle est locale.
 */

// Source UNIQUE des filtres (le smoke testait avant une regex divergente, plus
// faible que la prod → une régression pouvait passer verte). lib/titleFilters.js
// est pur (pas de "server-only", pas d'alias) donc importable en relatif ici.
import { isPackOrLotTitle, titleMatchesPlayer } from "../lib/titleFilters.js";

// Domaine canonique : `www`. La forme nue `cardmetrics.io` répond 308 vers
// `www` — `fetch` suit la redirection, mais chaque appel paie un aller-retour
// inutile et dépend d'un comportement implicite.
const PROD_URL = "https://www.cardmetrics.io";

// `--prod` plutôt qu'une variable d'environnement : `VAR=val cmd` n'est pas
// portable sous Windows, et un paquet comme `cross-env` serait une dépendance
// de plus pour une seule ligne (guardrail CLAUDE.md).
const WANTS_PROD = process.argv.includes("--prod");

const BASE_URL = WANTS_PROD
  ? PROD_URL
  : process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(BASE_URL);
const TIMEOUT_MS = 30_000; // le /api/deals à froid peut prendre ~15s

/**
 * Chaque route : soit un `marker` (sous-chaîne attendue dans le HTML/texte),
 * soit un `validate(text)` qui renvoie { ok, detail } après parsing du contenu.
 * Les validateurs de contenu (ajoutés par l'audit "confiance client", 2026-07-13)
 * attrapent les régressions que le simple 200 masquait (ex. scores à 0.0, junk
 * dans les deals) — voir PLAN-CONFIANCE-CLIENT.md tâche 12.
 * @type {Array<{ path: string; label: string; marker?: string; validate?: (text: string) => { ok: boolean; detail: string } }>}
 */
const ROUTES = [
  { path: "/", marker: "Card Metrics", label: "Home" },
  { path: "/deals", marker: "Deal Finder", label: "Deal Finder" },
  { path: "/opportunites", marker: "OPPORTUNITÉS", label: "Opportunités" },
  { path: "/player/8481540", marker: "PROFIL JOUEUR", label: "Fiche joueur" },
  { path: "/encheres", marker: "ENCHÈRES", label: "Enchères" },
  { path: "/pulse", marker: "PULSE", label: "Pulse" },
  { path: "/analyse", marker: "Analyser une annonce", label: "Analyse" },
  { path: "/backtest", marker: "Backtest", label: "Backtest" },
  { path: "/a-propos", marker: "propos", label: "À propos" },
  { path: "/api/player?q=McDavid", marker: "results", label: "API recherche joueur" },
  { path: "/api/pulse", marker: "enFeu", label: "API pulse" },
  { path: "/joueurs", marker: "Joueurs NHL", label: "Annuaire joueurs" },
  { path: "/api/joueurs?limit=5", marker: "players", label: "API joueurs" },
  { path: "/recrues", marker: "premières saisons NHL", label: "Classe de recrues" },
  {
    path: "/api/recrues",
    label: "Recrues · liste complète et dédupliquée",
    validate: (text) => {
      const j = JSON.parse(text);
      const rookies = Array.isArray(j?.rookies) ? j.rookies : [];
      if (rookies.length < 50) {
        return { ok: false, detail: `${rookies.length} recrues — liste anormalement courte` };
      }
      // La pagination de l'API NHL n'est stable que triée sur une clé unique
      // (voir lib/rookieClass.js) : un doublon signale une régression du tri.
      const ids = new Set(rookies.map((r) => r.playerId));
      if (ids.size !== rookies.length) {
        return { ok: false, detail: `${rookies.length - ids.size} doublon(s) de joueur` };
      }
      // Un non-repêché doit rester sans rang, jamais un « #0 » trié en tête.
      const zero = rookies.find((r) => r.draftOverall === 0);
      if (zero) {
        return { ok: false, detail: `rang de repêchage 0 sur ${zero.fullName}` };
      }
      return { ok: true, detail: `${rookies.length} recrues · ${j.scored} notées` };
    },
  },

  // ── Assertions de contenu (audit confiance client) ────────────────────────
  {
    path: "/api/opportunites/top",
    label: "T3 · scores opportunités > 0",
    validate: (text) => {
      const j = JSON.parse(text);
      const opps = j.opportunities ?? [];
      if (opps.length === 0) return { ok: false, detail: "aucune opportunité" };
      const zero = opps.filter((o) => !(Number(o.investmentScore) > 0));
      return zero.length === 0
        ? { ok: true, detail: `${opps.length} opportunités, toutes > 0` }
        : { ok: false, detail: `${zero.length} opportunité(s) à 0 — régression T3` };
    },
  },
  {
    path: "/opportunites",
    label: "T3 · pas de jauge « 0.0 » rendue",
    validate: (text) => {
      // Une vraie donnée ne doit jamais rendre 0.0 (onglet caché / crawler).
      const zeros = (text.match(/>0\.0</g) ?? []).length;
      return zeros === 0
        ? { ok: true, detail: "aucun « 0.0 » dans le HTML" }
        : { ok: false, detail: `${zeros} « 0.0 » rendus — régression T3` };
    },
  },
  {
    path: "/api/deals?player=Connor%20McDavid&mode=raw",
    label: "T1 · deals McDavid propres",
    validate: (text) => {
      const j = JSON.parse(text);
      const listings = j.listings ?? [];
      if ((j.validListings ?? 0) < 5) {
        return { ok: false, detail: `seulement ${j.validListings} annonces (attendu ≥ 5) — régression T1` };
      }
      const junk = listings.filter((l) => isPackOrLotTitle(l.title));
      return junk.length === 0
        ? { ok: true, detail: `${listings.length} annonces, 0 pack/lot` }
        : { ok: false, detail: `${junk.length} pack/lot dans les résultats — régression T1` };
    },
  },
  {
    path: "/api/auctions/ending-soon",
    label: "T4 · enchères ≤ 24h + bon joueur",
    validate: (text) => {
      const j = JSON.parse(text);
      const auctions = j.auctions ?? [];
      const badTime = auctions.filter((a) => Number(a.hoursLeft) > 24);
      const badName = auctions.filter((a) => !titleMatchesPlayer(a.playerName, a.title));
      if (badTime.length) return { ok: false, detail: `${badTime.length} enchère(s) > 24h — régression T4` };
      if (badName.length) return { ok: false, detail: `${badName.length} enchère(s) mauvais joueur — régression T4` };
      return { ok: true, detail: `${auctions.length} enchères ≤ 24h, joueur validé` };
    },
  },
  {
    path: "/pulse",
    label: "T9 · titre non dupliqué",
    validate: (text) => {
      const m = text.match(/<title>([^<]*)<\/title>/i);
      const title = m?.[1] ?? "";
      const count = (title.match(/Card Metrics/g) ?? []).length;
      return count === 1
        ? { ok: true, detail: `titre : « ${title} »` }
        : { ok: false, detail: `« Card Metrics » ×${count} dans le titre — régression T9` };
    },
  },
];

/**
 * @param {{ path: string; marker?: string; validate?: (text: string) => { ok: boolean; detail: string } }} route
 */
async function checkRoute(route) {
  const url = `${BASE_URL}${route.path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    if (route.validate) {
      if (!res.ok) return { ok: false, status: res.status, detail: `status ${res.status}` };
      try {
        const v = route.validate(text);
        return { ok: v.ok, status: res.status, detail: v.detail };
      } catch (err) {
        return { ok: false, status: res.status, detail: `validateur : ${String(err?.message ?? err)}` };
      }
    }
    const hasMarker = text.includes(route.marker);
    return {
      ok: res.ok && hasMarker,
      status: res.status,
      detail: res.ok && hasMarker
        ? `200 + marqueur "${route.marker}"`
        : `status ${res.status}${!hasMarker ? ` — marqueur "${route.marker}" absent` : ""}`,
    };
  } catch (err) {
    return { ok: false, status: 0, detail: `erreur réseau : ${String(err?.message ?? err)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`Smoke tests — ${BASE_URL}\n`);
  let failures = 0;

  for (const route of ROUTES) {
    const result = await checkRoute(route);
    const icon = result.ok ? "✓" : "✗";
    console.log(`${icon} ${route.label.padEnd(30)} ${route.path.padEnd(40)} ${result.detail}`);
    if (!result.ok) failures++;
  }

  // La cible est répétée dans la LIGNE DE RÉSUMÉ, pas seulement en tête. Un
  // « 18/18 routes OK » a déjà été lu comme une validation de la PROD alors que
  // le script tournait contre localhost — l'en-tête existait mais avait été
  // tronqué par un `tail`. Le verdict doit porter sa cible.
  console.log(
    `\n${ROUTES.length - failures}/${ROUTES.length} routes OK — ${BASE_URL}${
      IS_LOCAL ? "  ⚠ CIBLE LOCALE, PAS LA PRODUCTION" : ""
    }`
  );
  if (failures > 0) {
    console.error(`${failures} échec(s) — voir le détail ci-dessus.`);
    process.exit(1);
  }
}

main();
