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
const TIMEOUT_MS = 30_000; // le /api/deals à froid peut prendre ~15s

// Packs/lots — même esprit que TITLE_EXCLUDE_PACK_BOX_RE (lib/dealFinder.js).
// Inliné ici car le smoke est autonome ; garder les deux en phase.
const PACK_RE = /\bfat\s*pack\b|\bhobby\s*box\b|\bblaster\b|\bmega\s*box\b|\b\d+\s*cards\b|\bpossible\b|\bgiveaway\b|^\s*\(\d+\)/i;

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
      const junk = listings.filter((l) => PACK_RE.test(String(l.title ?? "")));
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
      const badName = auctions.filter((a) => {
        const ln = String(a.playerName ?? "").split(/\s+/).pop()?.toLowerCase() ?? "";
        return ln.length >= 3 && !String(a.title ?? "").toLowerCase().includes(ln);
      });
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

  console.log(`\n${ROUTES.length - failures}/${ROUTES.length} routes OK.`);
  if (failures > 0) {
    console.error(`${failures} échec(s) — voir le détail ci-dessus.`);
    process.exit(1);
  }
}

main();
