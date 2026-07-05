#!/usr/bin/env node
/**
 * Crée (ou réinitialise) l'utilisateur de test pour la vérification visuelle
 * des pages authentifiées (tâche 3.2). Utilise le rôle service Supabase —
 * ne jamais lancer contre la prod avec de vraies données utilisateur.
 *
 * Prérequis : le provider "Email" doit être activé côté Supabase Auth
 * (Authentication → Providers → Email) ET la confirmation d'email désactivée
 * (Authentication → Settings → "Confirm email" = off) pour que
 * signInWithPassword fonctionne immédiatement après ce script.
 *
 * Usage : node scripts/seedTestUser.mjs
 * Variables requises : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (lues depuis .env.local si présent).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? "test-agent@cardmetrics.io";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "CardMetrics-Test-2026!";

const WATCHLIST_SEED = [
  { playerId: "8481540", playerName: "Cole Caufield", playerTeam: "MTL", playerPosition: "RW" },
  { playerId: "8484144", playerName: "Connor Bedard", playerTeam: "CHI", playerPosition: "C" },
];

const PORTFOLIO_SEED = [
  {
    playerId: "8481540", playerName: "Cole Caufield", team: "MTL",
    cardType: "Young Guns", grade: "raw", printRun: null,
    acquisitionType: "purchase", purchasePriceCad: 45.0,
    purchaseDate: "2025-11-02", notes: "Achetée sur eBay, seed de test",
  },
  {
    playerId: "8484144", playerName: "Connor Bedard", team: "CHI",
    cardType: "Young Guns Auto", grade: "PSA 10", printRun: null,
    acquisitionType: "pack_pull", boxCostCad: 150.0, boxCardsCount: 1,
    purchaseDate: "2025-10-15", notes: "Pullée d'une box, seed de test",
  },
];

const ALERTS_SEED = [
  { playerId: "8481540", playerName: "Cole Caufield", maxPriceCad: 30 },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants (voir .env.local).");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  // Trouve l'utilisateur existant (l'admin API n'a pas de "get by email" direct).
  let userId = null;
  {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      console.error("listUsers a échoué :", error.message);
      process.exit(1);
    }
    const existing = (data?.users ?? []).find((u) => u.email === TEST_EMAIL);
    userId = existing?.id ?? null;
  }

  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      console.error("Impossible de réinitialiser le mot de passe :", error.message);
      process.exit(1);
    }
    console.log(`Utilisateur de test existant réutilisé (${TEST_EMAIL}), mot de passe réinitialisé.`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) {
      console.error("Création de l'utilisateur de test échouée :", error.message);
      process.exit(1);
    }
    userId = data.user.id;
    console.log(`Utilisateur de test créé (${TEST_EMAIL}).`);
  }

  // Watchlist (idempotent : on ignore les doublons de contrainte unique).
  for (const item of WATCHLIST_SEED) {
    const { error } = await admin.from("watchlist").insert({
      user_id: userId,
      player_id: item.playerId,
      player_name: item.playerName,
      player_team: item.playerTeam,
      player_position: item.playerPosition,
    });
    if (error && !error.message.includes("duplicate")) {
      console.error(`Watchlist (${item.playerName}) :`, error.message);
    }
  }
  console.log(`Watchlist : ${WATCHLIST_SEED.length} entrée(s) seedée(s).`);

  // Portfolio.
  for (const card of PORTFOLIO_SEED) {
    const purchasePriceCad = card.acquisitionType === "pack_pull"
      ? Math.round((card.boxCostCad / (card.boxCardsCount || 1)) * 100) / 100
      : card.purchasePriceCad;
    const { error } = await admin.from("portfolio_cards").insert({
      user_id: userId,
      player_id: card.playerId,
      player_name: card.playerName,
      team: card.team,
      card_type: card.cardType,
      grade: card.grade,
      print_run: card.printRun,
      acquisition_type: card.acquisitionType,
      purchase_price_cad: purchasePriceCad,
      box_cost_cad: card.boxCostCad ?? null,
      box_cards_count: card.boxCardsCount ?? null,
      purchase_date: card.purchaseDate,
      notes: card.notes,
    });
    if (error) {
      console.error(`Portfolio (${card.playerName}) :`, error.message);
    }
  }
  console.log(`Portfolio : ${PORTFOLIO_SEED.length} carte(s) seedée(s).`);

  // Alertes prix.
  for (const alert of ALERTS_SEED) {
    const { error } = await admin.from("price_alerts").insert({
      user_id: userId,
      player_id: alert.playerId,
      player_name: alert.playerName,
      max_price_cad: alert.maxPriceCad,
    });
    if (error) {
      console.error(`Alerte (${alert.playerName}) :`, error.message);
    }
  }
  console.log(`Alertes : ${ALERTS_SEED.length} alerte(s) seedée(s).`);

  console.log("\nSeed terminé.");
  console.log(`  Email    : ${TEST_EMAIL}`);
  console.log(`  Password : ${TEST_PASSWORD}`);
  console.log("  Rappel : NEXT_PUBLIC_ALLOW_TEST_LOGIN=1 doit être présent dans .env.local pour voir le formulaire de connexion de test.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
