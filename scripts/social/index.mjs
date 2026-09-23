#!/usr/bin/env node
/**
 * Visuels réseaux sociaux de Card Metrics, sur les VRAIES données du jour.
 *
 *   npm run social              → Reels vidéo + posts images
 *   npm run social -- --images  → posts images seulement (rapide)
 *
 * Sortie : social-posts/<AAAA-MM-JJ>/ (ignoré par git) + reels.md / posts.md.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { ROOT, loadData, scoresDateLabel } from "./kit.mjs";
import { renderFeed } from "./render.mjs";
import { renderReels } from "./video.mjs";

async function main() {
  const d = await loadData();
  const date = scoresDateLabel();
  const out = path.join(ROOT, "social-posts", new Date().toISOString().slice(0, 10));
  mkdirSync(out, { recursive: true });

  if (!process.argv.includes("--images")) await renderReels(d, out, date);
  await renderFeed(d, out, date);
  console.log(`\n→ ${path.relative(ROOT, out)}`);
}

main().catch((err) => {
  console.error("[social] échec:", err?.message ?? err);
  process.exit(1);
});
