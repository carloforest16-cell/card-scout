import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { resolveFullName } from "@/lib/nhlPlayerLanding";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";

import PlayerAiScoreClient from "./PlayerAiScoreClient";
import PlayerEbayClient from "./PlayerEbayClient";
import PlayerHeroSection from "./PlayerHeroSection";
import {
  PlayerHeroSkeleton,
  PlayerStatsHistorySkeleton,
} from "./PlayerSkeletons";
import PlayerStatsHistorySection from "./PlayerStatsHistorySection";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await getPlayerLandingCached(id);
  if (!data) {
    return { title: "Joueur introuvable | Card Scout" };
  }
  const name = resolveFullName(data);
  return { title: `${name} | Card Scout` };
}

export default async function PlayerPage({ params }) {
  const { id } = await params;
  if (!id || !/^\d+$/.test(String(id))) {
    notFound();
  }

  return (
    <main className="player">
      <div className="player__inner">
        <Link className="player__back" href="/">
          ← Accueil
        </Link>

        <Suspense fallback={<PlayerHeroSkeleton />}>
          <PlayerHeroSection id={String(id)} />
        </Suspense>

        <Suspense fallback={<PlayerStatsHistorySkeleton />}>
          <PlayerStatsHistorySection id={String(id)} />
        </Suspense>

        <PlayerAiScoreClient playerId={String(id)} />

        <PlayerEbayClient playerId={String(id)} />
      </div>
    </main>
  );
}
