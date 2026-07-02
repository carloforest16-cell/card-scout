import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/** Mapping cron_name → label + route interne */
const AGENT_REGISTRY = [
  {
    id: "opportunites",
    label: "Top 10 Opportunités",
    cronName: "opportunites",
    route: "/api/cron/opportunites",
    icon: "trophy",
    metricLabel: "opportunités générées",
    description: "Analyse ~75 joueurs NHL, score chacun via DeepSeek, génère les 10 meilleures opportunités d'investissement avec narratif.",
    schedule: "1er & 15 du mois à 6h UTC",
    expect: "10 joueurs avec score, verdict et explication. Cache valide 14 jours.",
  },
  {
    id: "enrich-scores",
    label: "Score Enricher",
    cronName: "enrich-scores",
    route: "/api/cron/enrich-scores",
    icon: "chart",
    metricLabel: "scores enrichis",
    description: "Calcule les 4 sous-scores avancés (Catalyseurs, Risque, Discrépance Marché, Attention Sociale) pour tous les joueurs en base.",
    schedule: "Quotidien à 4h UTC",
    expect: "160 joueurs mis à jour. Ces sous-scores sont skippés en fastMode.",
  },
  {
    id: "hottest",
    label: "Hottest Deals",
    cronName: "hottest",
    route: "/api/cron/hottest",
    icon: "fire",
    metricLabel: "deals analysés",
    description: "Récupère les deals eBay les plus chauds du moment et les trie par score d'investissement pour la section Deals Chauds.",
    schedule: "Toutes les 4h",
    expect: "Liste fraîche de deals sur /deals et la home.",
  },
  {
    id: "recompute-scores",
    label: "Recompute Scores",
    cronName: "recompute-scores",
    route: "/api/cron/recompute-scores",
    icon: "refresh",
    metricLabel: "scores recalculés",
    description: "Recalcule le Card Metrics Score complet (7 facteurs + ajustement DeepSeek ±0.5) pour tous les joueurs en base.",
    schedule: "Hebdomadaire",
    expect: "Scores mis à jour dans player_scores. Peut prendre 5-10 min.",
  },
  {
    id: "snapshot-scores",
    label: "Snapshot Scores",
    cronName: "snapshot-scores",
    route: "/api/cron/snapshot-scores",
    icon: "camera",
    metricLabel: "snapshots créés",
    description: "Sauvegarde un snapshot historique des scores pour permettre le backtesting et le graphique d'évolution sur les fiches joueur.",
    schedule: "Quotidien à 3h UTC",
    expect: "1 snapshot par joueur actif. Alimente les graphiques /player/[id].",
  },
  {
    id: "price-alerts",
    label: "Price Alerts",
    cronName: "price-alerts",
    route: "/api/cron/price-alerts",
    icon: "bell",
    metricLabel: "alertes envoyées",
    description: "Vérifie les alertes prix des utilisateurs et envoie un email Resend quand un seuil est atteint.",
    schedule: "Toutes les 6h",
    expect: "Emails envoyés aux users qui ont créé une alerte sur un joueur.",
  },
  {
    id: "watchlist-alerts",
    label: "Watchlist Alerts",
    cronName: "watchlist-alerts",
    route: "/api/cron/watchlist-alerts",
    icon: "eye",
    metricLabel: "alertes watchlist",
    description: "Notifie les utilisateurs quand un joueur de leur watchlist change significativement de score ou de prix.",
    schedule: "Quotidien",
    expect: "Emails de digest pour les users avec watchlist active.",
  },
  {
    id: "daily-digest",
    label: "Daily Digest",
    cronName: "daily-digest",
    route: "/api/cron/daily-digest",
    icon: "mail",
    metricLabel: "emails envoyés",
    description: "Envoie le résumé quotidien aux abonnés : top deals du jour, mouvements de scores, opportunités à surveiller.",
    schedule: "Quotidien à 8h UTC",
    expect: "1 email par abonné actif. Contenu généré par DeepSeek.",
  },
  {
    id: "weekly-picks",
    label: "Weekly Picks",
    cronName: "weekly-picks",
    route: "/api/cron/weekly-picks",
    icon: "star",
    metricLabel: "picks générés",
    description: "Génère la sélection hebdomadaire des meilleures cartes à acheter cette semaine, basée sur momentum + prix eBay.",
    schedule: "Lundi à 7h UTC",
    expect: "5-10 picks avec raisonnement. Utilisé dans le digest et /opportunites.",
  },
  {
    id: "card-prices",
    label: "Card Prices",
    cronName: "card-prices",
    route: "/api/cron/card-prices",
    icon: "tag",
    metricLabel: "prix mis à jour",
    description: "Rafraîchit les prix eBay de référence pour les joueurs populaires afin de maintenir la précision du facteur Marché dans le score.",
    schedule: "Quotidien à 2h UTC",
    expect: "Prix eBay à jour dans cache_generic. Améliore la précision des scores.",
  },
  {
    id: "auctions",
    label: "Auctions",
    cronName: "auctions",
    route: "/api/cron/auctions",
    icon: "gavel",
    metricLabel: "enchères traitées",
    description: "Surveille les enchères eBay actives sur les joueurs suivis et identifie les bonnes affaires en cours.",
    schedule: "Toutes les 2h",
    expect: "Enchères actives triées par opportunité. Peut alimenter une future section.",
  },
  {
    id: "welcome-emails",
    label: "Welcome Emails",
    cronName: "welcome-emails",
    route: "/api/cron/welcome-emails",
    icon: "envelope",
    metricLabel: "emails envoyés",
    description: "Envoie l'email de bienvenue aux nouveaux inscrits qui n'ont pas encore reçu leur onboarding.",
    schedule: "Toutes les heures",
    expect: "Email de bienvenue avec guide d'utilisation. 1 seul envoi par user.",
  },
];

export async function GET(request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  try {
    const db = getSupabaseAdmin();

    // Dernière run + runs d'aujourd'hui pour chaque cron
    const { data: runs } = await db
      .from("cron_runs")
      .select("cron_name, ran_at, status, rows_affected, duration_ms")
      .order("ran_at", { ascending: false })
      .limit(500);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Grouper par cron_name
    const byName = {};
    for (const run of runs ?? []) {
      if (!byName[run.cron_name]) {
        byName[run.cron_name] = { latest: run, todayCount: 0, errorCount: 0 };
      }
      if (new Date(run.ran_at) >= todayStart) {
        byName[run.cron_name].todayCount++;
        if (run.status === "error") byName[run.cron_name].errorCount++;
      }
    }

    const agents = AGENT_REGISTRY.map((agent) => {
      const info = byName[agent.cronName];
      const latest = info?.latest;

      let status = "idle";
      if (latest) {
        status = latest.status === "error" ? "error" : "ok";
      }

      return {
        id: agent.id,
        label: agent.label,
        icon: agent.icon,
        metricLabel: agent.metricLabel,
        description: agent.description ?? null,
        schedule: agent.schedule ?? null,
        expect: agent.expect ?? null,
        status,
        lastRun: latest?.ran_at ?? null,
        lastRowsAffected: latest?.rows_affected ?? null,
        lastDurationMs: latest?.duration_ms ?? null,
        todayRuns: info?.todayCount ?? 0,
        todayErrors: info?.errorCount ?? 0,
      };
    });

    // Compteurs globaux
    const todayTotal = Object.values(byName).reduce((s, v) => s + v.todayCount, 0);
    const activeAgents = agents.filter((a) => a.status === "ok").length;

    return NextResponse.json({
      ok: true,
      agents,
      meta: {
        totalAgents: agents.length,
        activeAgents,
        todayRuns: todayTotal,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
