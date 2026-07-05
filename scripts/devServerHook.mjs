#!/usr/bin/env node
/**
 * Hook SessionStart portable (remplace le hook Windows-only PowerShell +
 * chemin local codé en dur, qui échouait silencieusement en session
 * Linux/web — et pointait même vers un chemin obsolète
 * "Documents\Card-caster\card-scout" au lieu du vrai repo).
 *
 * Démarre le serveur dev sur le port 3001 seulement s'il n'écoute pas déjà
 * (évite un doublon si une autre session a déjà un serveur dev actif).
 */
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3001;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

async function main() {
  const inUse = await isPortInUse(PORT);
  if (inUse) {
    console.log(`Port ${PORT} déjà utilisé — serveur dev probablement déjà lancé, rien à faire.`);
    return;
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCmd, ["run", "dev", "--", "--port", String(PORT)], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  console.log(`Serveur Next.js démarré en arrière-plan sur le port ${PORT}.`);
}

main().catch((err) => {
  console.error("devServerHook: échec non bloquant —", err?.message ?? err);
});
