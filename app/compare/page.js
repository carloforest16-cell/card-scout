import Link from "next/link";

import AppNav from "../AppNav";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";
import { resolveFullName } from "@/lib/nhlPlayerLanding";
import { getStoredPlayerScore } from "@/lib/playerScores";

import "../cinematic.css";
import "./compare.css";

import CompareClient from "./CompareClient";

export const metadata = {
  title: "Comparer des joueurs | Card Metrics",
  description: "Comparer 1 à 3 joueurs NHL côte à côte : score Card Metrics, stats et verdict IA.",
};
export const dynamic = "force-dynamic";

async function loadPlayer(id) {
  if (!id || !/^\d+$/.test(String(id))) return null;
  const [landing, stored] = await Promise.all([
    getPlayerLandingCached(String(id)).catch(() => null),
    getStoredPlayerScore(String(id)).catch(() => null),
  ]);
  if (!landing) return null;
  const name = resolveFullName(landing);
  const data = stored?.data ?? null;
  const featured = landing.featuredStats?.regularSeason?.subSeason ?? landing.featuredStats?.regularSeason ?? null;
  return {
    id: String(id),
    name,
    team: landing.currentTeamAbbrev ?? landing.teamName ?? null,
    position: landing.position ?? landing.positionCode ?? null,
    headshot: landing.headshot ?? null,
    score: data?.score ?? null,
    tier: data?.tier ?? null,
    breakdown: data?.breakdown ?? data?.factors ?? null,
    verdict: data?.verdict ?? data?.summary ?? null,
    age: landing.age ?? null,
    height: landing.heightInInches ?? null,
    weight: landing.weightInPounds ?? null,
    stats: featured ? {
      gamesPlayed: featured.gamesPlayed ?? null,
      goals: featured.goals ?? null,
      assists: featured.assists ?? null,
      points: featured.points ?? null,
      plusMinus: featured.plusMinus ?? null,
    } : null,
  };
}

export default async function ComparePage({ searchParams }) {
  const params = await searchParams;
  const idsRaw = params?.ids ?? "";
  const ids = String(idsRaw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  const players = (await Promise.all(ids.map(loadPlayer))).filter(Boolean);

  return (
    <div className="cinematic cmp-page">
      <div className="cmp-rail">
        <AppNav active={null} />
      </div>
      <main className="cmp-main">
        <header className="cmp-hero">
          <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />COMPARAISON</p>
          <h1 className="cn-h1 cmp-title">
            {players.length === 0 ? "Compare des joueurs" :
              players.length === 1 ? "Comparaison" :
                `Comparaison · ${players.length} joueurs`}
          </h1>
          <p className="cmp-sub">
            Place 1 à 3 joueurs côte à côte. Score Card Metrics, stats et verdict IA pour
            choisir le meilleur investissement.
          </p>
        </header>

        {players.length === 0 ? (
          <div className="cmp-empty">
            <p>Sélectionne un premier joueur pour démarrer la comparaison.</p>
            <Link href="/" className="cmp-empty__cta">Rechercher un joueur</Link>
          </div>
        ) : (
          <CompareClient initialPlayers={players} />
        )}
      </main>
    </div>
  );
}
