/**
 * Card Scout — Générateur d'idées d'amélioration via DeepSeek
 * Usage: node scripts/suggest.js
 * Env:   DEEPSEEK_API_KEY=sk-...
 */

import { readFileSync, execSync } from "fs";
import { resolve } from "path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

function readFile(rel) {
  try { return readFileSync(resolve(ROOT, rel), "utf8"); } catch { return ""; }
}

function gitLog() {
  try {
    return execSync("git log --oneline -20", { cwd: ROOT, encoding: "utf8" });
  } catch { return ""; }
}

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error("❌  Définis DEEPSEEK_API_KEY dans ton environnement.");
  console.error("    ex: $env:DEEPSEEK_API_KEY='sk-...' (PowerShell)");
  process.exit(1);
}

const claude_md = readFile("CLAUDE.md");
const backlog_md = readFile("memory/project_backlog.md");
const log = gitLog();

const SYSTEM = `Tu es un expert produit en collectionnables sportifs (cartes NHL).
Tu analyses un projet Next.js appelé Card Scout et proposes des améliorations concrètes.
Réponds UNIQUEMENT en JSON valide, aucun texte avant ou après.`;

const USER = `Voici le contexte du projet Card Scout :

## CLAUDE.md (architecture)
${claude_md.slice(0, 3000)}

## Backlog connu
${backlog_md.slice(0, 1500)}

## 20 derniers commits
${log}

---
Génère exactement 5 idées d'amélioration classées par impact décroissant.
Format JSON strict :
{
  "ideas": [
    {
      "rank": 1,
      "title": "Titre court (max 8 mots)",
      "why": "Pourquoi c'est impactant en 1 phrase",
      "what": "Ce qu'il faut faire concrètement (2-4 phrases)",
      "effort": "S | M | L",
      "category": "crédibilité | rétention | onboarding | polish"
    }
  ]
}`;

console.log("⏳  Appel DeepSeek...\n");

const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: USER },
    ],
    temperature: 0.7,
    max_tokens: 1500,
  }),
});

if (!res.ok) {
  const err = await res.text();
  console.error("❌  DeepSeek error:", res.status, err);
  process.exit(1);
}

const json = await res.json();
const raw = json.choices?.[0]?.message?.content ?? "";

let parsed;
try {
  // Extrait le JSON même si DeepSeek ajoute du texte autour
  const match = raw.match(/\{[\s\S]*\}/);
  parsed = JSON.parse(match?.[0] ?? raw);
} catch {
  console.error("❌  Impossible de parser la réponse DeepSeek:\n", raw);
  process.exit(1);
}

const ideas = parsed.ideas ?? [];
const EFFORT_LABEL = { S: "⚡ Rapide", M: "🔧 Moyen", L: "🏗️  Long" };
const CAT_EMOJI = { crédibilité: "🏆", rétention: "🔄", onboarding: "👋", polish: "✨" };

console.log("━".repeat(60));
console.log("  CARD SCOUT — Idées d'amélioration (DeepSeek)");
console.log("━".repeat(60) + "\n");

for (const idea of ideas) {
  const effort = EFFORT_LABEL[idea.effort] ?? idea.effort;
  const cat = CAT_EMOJI[idea.category] ?? "•";
  console.log(`#${idea.rank}  ${idea.title}`);
  console.log(`    ${cat} ${idea.category}  ·  ${effort}`);
  console.log(`    💡 ${idea.why}`);
  console.log(`    📋 ${idea.what}`);
  console.log();
}

console.log("━".repeat(60));
console.log("  👉  Copie une idée et donne-la à Claude Code pour implémenter.");
console.log("━".repeat(60));
