import "./joueurs.css";

import AppNav from "../AppNav";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import JoueursClient from "./JoueursClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Joueurs NHL — Card Metrics",
  description:
    "Annuaire complet des joueurs NHL de la saison courante — score d'investissement, stats, équipe et position. Browse, filtre et trie par score Card Metrics.",
  openGraph: {
    title: "Joueurs NHL — Card Metrics",
    description:
      "Annuaire complet des joueurs NHL — score d'investissement, stats, équipe et position.",
  },
};

async function getPlayerCount() {
  try {
    const db = getSupabaseAdmin();
    const { count } = await db
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("sport", "NHL")
      .eq("is_active", true);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function JoueursPage() {
  const total = await getPlayerCount();

  return (
    <div className="jr-page">
      <AppNav />

      <div className="jr-hero">
        <span className="jr-hero__eyebrow">Annuaire · NHL {new Date().getFullYear()}</span>
        <h1 className="jr-hero__title">Joueurs NHL</h1>
        <p className="jr-hero__sub">
          {total > 0
            ? `${total} joueurs actifs — score d'investissement, stats et deals eBay`
            : "Annuaire complet des patineurs de la saison courante"}
        </p>
      </div>

      <JoueursClient initialTotal={total} />
    </div>
  );
}
