/**
 * Card Metrics — Générateur d'idées d'amélioration
 * Usage:  node scripts/suggest.js              → DeepSeek (recommandé)
 *         node scripts/suggest.js --local       → LLM local Ollama (localhost:11434)
 * Env:    DEEPSEEK_API_KEY=sk-...  (requis sauf --local)
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";
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
Tu analyses un projet Next.js appelé Card Metrics et proposes des améliorations concrètes.
Réponds UNIQUEMENT en JSON valide, aucun texte avant ou après.`;

const USER = `Voici le contexte du projet Card Metrics :

## CLAUDE.md (architecture)
${claude_md.slice(0, 3000)}

## Backlog connu
${backlog_md.slice(0, 1500)}

## 20 derniers commits
${log}

---

## FEATURES DÉJÀ EXISTANTES — NE PAS PROPOSER
- Watchlist + alertes email (nouveau listing, spike volume, gros match)
- Page /compare pour comparer deux joueurs
- Page /analyse (coller URL eBay → analyse IA complète)
- Page /encheres (enchères chaudes sous la cote)
- Daily digest email + page souscription /digest
- Mémoire visiteur "Continuer là où tu étais" (localStorage)
- Tour guidé première visite (3 étapes)
- Page /a-propos
- Picks hebdomadaires (newsletter /picks)
- Grading ROI Estimator (/grading)
- Market Pulse dashboard (/pulse)
- Hottest Deals section (/deals)
- Alertes prix (/alertes)
- Mon Vault (/portfolio)
- Scores centralisés Supabase

## CONTRAINTES TECHNIQUES — NE PAS PROPOSER
- Sold listings eBay via API : IMPOSSIBLE — l'API eBay Finding (findCompletedItems) a été décommissionnée en février 2025. L'API Marketplace Insights nécessite un accès premium non disponible. Ne jamais proposer quoi que ce soit basé sur les ventes réelles eBay.
- Pas de domaine custom pour l'instant (emails Resend limités)

---
OBJECTIF STRATÉGIQUE : Le fondateur veut monétiser Card Metrics sans nuire à l'expérience utilisateur.
Pense comme un expert produit + growth hacker : qu'est-ce qui rendrait Card Metrics INDISPENSABLE pour un collectionneur sérieux, et qu'est-ce qu'il paierait volontiers pour avoir ?

Génère exactement 5 idées classées par impact décroissant sur la monétisation ET l'attractivité.
Propose uniquement des choses NOUVELLES qui n'existent pas encore.
Sois créatif — dépasse les suggestions génériques. Pense aux modèles freemium, aux données exclusives, aux features sociales, aux niches non exploitées dans le monde des cartes NHL.

Format JSON strict :
{
  "ideas": [
    {
      "rank": 1,
      "title": "Titre court (max 8 mots)",
      "why": "Pourquoi c'est impactant pour la monétisation ET l'attractivité en 1 phrase",
      "what": "Ce qu'il faut faire concrètement (2-4 phrases)",
      "monetization": "Comment ça génère des revenus ou prépare la monétisation",
      "effort": "S | M | L",
      "category": "crédibilité | rétention | onboarding | polish | monétisation"
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
    model: "deepseek-v4-pro",
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: USER },
    ],
    temperature: 0.7,
    max_tokens: 4000,
    thinking: { type: "enabled" },
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
  // Cherche le dernier bloc JSON complet (ignore le thinking avant)
  const matches = [...raw.matchAll(/\{[\s\S]*?\}/g)];
  // Prend le plus grand match (le vrai JSON, pas un fragment)
  const best = matches.sort((a, b) => b[0].length - a[0].length)[0];
  parsed = JSON.parse(best?.[0] ?? raw);
} catch {
  // Fallback : cherche entre ```json ... ```
  try {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    parsed = JSON.parse(fence?.[1] ?? raw);
  } catch {
    console.error("❌  Impossible de parser la réponse DeepSeek.");
    console.error("Raw response:\n", raw.slice(0, 1000));
    process.exit(1);
  }
}

const ideas = parsed.ideas ?? [];

const CAT_COLOR = {
  crédibilité: "#f59e0b",
  rétention:   "#10b981",
  onboarding:  "#6366f1",
  polish:      "#3b82f6",
};
const EFFORT_COLOR = { S: "#22c55e", M: "#f97316", L: "#ef4444" };
const EFFORT_LABEL = { S: "Rapide", M: "Moyen", L: "Long" };

const cards = ideas.map((idea) => {
  const cc = CAT_COLOR[idea.category] ?? "#94a3b8";
  const ec = EFFORT_COLOR[idea.effort] ?? "#94a3b8";
  const el = EFFORT_LABEL[idea.effort] ?? idea.effort;
  return `
    <div class="card">
      <div class="card-header">
        <span class="rank">#${idea.rank}</span>
        <h2>${idea.title}</h2>
      </div>
      <div class="tags">
        <span class="tag" style="background:${cc}22;color:${cc};border-color:${cc}44">${idea.category}</span>
        <span class="tag" style="background:${ec}22;color:${ec};border-color:${ec}44">⏱ ${el}</span>
      </div>
      <p class="why">💡 ${idea.why}</p>
      <p class="what">📋 ${idea.what}</p>
      ${idea.monetization ? `<p class="monetization">💰 ${idea.monetization}</p>` : ""}
    </div>`;
}).join("\n");

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Card Metrics — Idées DeepSeek</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
  h1 { font-size: 1.25rem; font-weight: 700; color: #94a3b8; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 1.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1.25rem; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .card-header { display: flex; align-items: flex-start; gap: 0.75rem; }
  .rank { font-size: 1.5rem; font-weight: 900; color: #475569; flex-shrink: 0; line-height: 1; }
  h2 { font-size: 1.05rem; font-weight: 700; color: #f1f5f9; line-height: 1.3; }
  .tags { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .tag { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 999px; border: 1px solid; text-transform: uppercase; letter-spacing: 0.05em; }
  .why { font-size: 0.875rem; color: #94a3b8; line-height: 1.6; }
  .what { font-size: 0.875rem; color: #cbd5e1; line-height: 1.6; }
  .monetization { font-size: 0.8rem; color: #4ade80; line-height: 1.6; background: #052e1644; border: 1px solid #166534; border-radius: 6px; padding: 0.4rem 0.7rem; margin-top: 0.25rem; }
  footer { margin-top: 2rem; text-align: center; font-size: 0.75rem; color: #475569; }
</style>
</head>
<body>
<h1>Card Metrics — Idées d'amélioration · DeepSeek</h1>
<div class="grid">${cards}</div>
<footer>Copie une idée et donne-la à Claude Code pour implémenter.</footer>
</body>
</html>`;

import { writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { exec } from "child_process";

const outFile = join(tmpdir(), "card-scout-ideas.html");
writeFileSync(outFile, html, "utf8");

// Ouvre dans le browser selon l'OS
const opener = process.platform === "win32" ? `start "" "${outFile}"` : `open "${outFile}"`;
exec(opener);
console.log(`✅  Ouvert dans le browser : ${outFile}`);
