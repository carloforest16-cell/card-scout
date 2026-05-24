const fs = require("node:fs");
const path = require("node:path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

(async () => {
  const { register } = await import("node:module");
  const { pathToFileURL } = await import("node:url");

  const loaderUrl = pathToFileURL(
    path.join(__dirname, "warmCache-loader.mjs")
  ).href;
  await register(loaderUrl, pathToFileURL(__dirname));

  const { getTopOpportunites } = await import("../lib/opportunitesTop.js");
  const { buildTrendingPayload } = await import("../lib/trendingData.js");
  const { getDealFinderResult } = await import("../lib/dealFinder.js");
  const { buildHottestDealsPayload } = await import("../lib/dealsHottest.js");
  const { getUnderdogPlayers } = await import("../lib/underdogFinder.js");

  const oppResult = await getTopOpportunites({ forceRefresh: true });
  if (!oppResult.ok) {
    console.error(oppResult.error ?? "Échec warm cache opportunités");
    process.exit(1);
  }
  console.log("Cache opportunités sauvegardé");

  await buildTrendingPayload({ forceRefresh: true });
  console.log("Cache trending sauvegardé");

  const caufieldResult = await getDealFinderResult("Cole Caufield", "raw", {
    forceRefresh: true,
  });
  if (!caufieldResult.ok) {
    console.error(caufieldResult.error ?? "Échec warm cache Caufield");
    process.exit(1);
  }
  console.log("Cache deals Caufield sauvegardé");

  const hottestResultRaw = await buildHottestDealsPayload({
    forceRefresh: true,
    cardMode: "raw",
  });
  if (!hottestResultRaw.ok) {
    console.error("Échec warm cache hottest deals raw");
    process.exit(1);
  }
  console.log("Cache hottest deals raw sauvegardé");

  const hottestResultGraded = await buildHottestDealsPayload({
    forceRefresh: true,
    cardMode: "graded",
  });
  if (!hottestResultGraded.ok) {
    console.error("Échec warm cache hottest deals graded");
    process.exit(1);
  }
  console.log("Cache hottest deals graded sauvegardé");

  await getUnderdogPlayers({ forceRefresh: true });
  console.log("Cache underdog sauvegardé");

  console.log("Tous les caches sauvegardés !");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
