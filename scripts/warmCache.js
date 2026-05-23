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
  const result = await getTopOpportunites({ forceRefresh: true });

  if (!result.ok) {
    console.error(result.error ?? "Échec du warm cache");
    process.exit(1);
  }

  console.log("Cache sauvegardé !");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
