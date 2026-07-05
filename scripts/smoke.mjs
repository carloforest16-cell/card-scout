#!/usr/bin/env node
/**
 * Smoke tests (tâche 6.3 du plan) — filet de sécurité rapide pour la loop.
 * Fetch ~12 routes clés (pages SSR + APIs publiques) contre un serveur local
 * et vérifie un status 200 + un marqueur de contenu attendu par route.
 *
 * Usage : npm run smoke
 * Nécessite un serveur dev/prod déjà lancé sur BASE_URL (défaut localhost:3001).
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const TIMEOUT_MS = 20_000;

/** @type {Array<{ path: string; marker: string; label: string }>} */
const ROUTES = [
  { path: "/", marker: "Card Metrics", label: "Home" },
  { path: "/deals", marker: "Deal Finder", label: "Deal Finder" },
  { path: "/opportunites", marker: "OPPORTUNITÉS", label: "Opportunités" },
  { path: "/player/8481540", marker: "PROFIL JOUEUR", label: "Fiche joueur" },
  { path: "/encheres", marker: "ENCHÈRES", label: "Enchères" },
  { path: "/pulse", marker: "PULSE", label: "Pulse" },
  { path: "/analyse", marker: "ANALYSER", label: "Analyse" },
  { path: "/backtest", marker: "Backtest — Card Metrics", label: "Backtest" },
  { path: "/a-propos", marker: "propos", label: "À propos" },
  { path: "/api/player?q=McDavid", marker: "results", label: "API recherche joueur" },
  { path: "/api/opportunites/top", marker: "opportunities", label: "API top opportunités" },
  { path: "/api/pulse", marker: "enFeu", label: "API pulse" },
  { path: "/joueurs", marker: "Joueurs NHL", label: "Annuaire joueurs" },
  { path: "/api/joueurs?limit=5", marker: "players", label: "API joueurs" },
];

/**
 * @param {string} path
 * @param {string} marker
 */
async function checkRoute(path, marker) {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    const hasMarker = text.includes(marker);
    return { ok: res.ok && hasMarker, status: res.status, hasMarker };
  } catch (err) {
    return { ok: false, status: 0, hasMarker: false, error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`Smoke tests — ${BASE_URL}\n`);
  let failures = 0;

  for (const route of ROUTES) {
    const result = await checkRoute(route.path, route.marker);
    const icon = result.ok ? "✓" : "✗";
    const detail = result.ok
      ? `200 + marqueur "${route.marker}" trouvé`
      : result.error
        ? `erreur réseau : ${result.error}`
        : `status ${result.status}${!result.hasMarker ? ` — marqueur "${route.marker}" absent` : ""}`;
    console.log(`${icon} ${route.label.padEnd(24)} ${route.path.padEnd(28)} ${detail}`);
    if (!result.ok) failures++;
  }

  console.log(`\n${ROUTES.length - failures}/${ROUTES.length} routes OK.`);
  if (failures > 0) {
    console.error(`${failures} échec(s) — voir le détail ci-dessus.`);
    process.exit(1);
  }
}

main();
