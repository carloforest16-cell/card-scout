import "../../cinematic.css";
import "../../components/alert-button.css";
import "../../components/follow-button.css";
import "../../components/price-history-chart.css";
import "./player.css";
import "./spatial-showcase.css";

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import AppNav from "../../AppNav";
import Atmosphere from "../../components/Atmosphere";
import ScrollProgress from "../../components/ScrollProgress";
import { resolveFullName } from "@/lib/nhlPlayerLanding";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";

import PlayerHeroSection from "./PlayerHeroSection";
import PlayerPriceHistory from "./PlayerPriceHistory";
import {
  PlayerHeroSkeleton,
  PlayerStatsHistorySkeleton,
} from "./PlayerSkeletons";
import PlayerStatsHistorySection from "./PlayerStatsHistorySection";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await getPlayerLandingCached(id);
  if (!data) {
    return { title: "Joueur introuvable" };
  }
  const name = resolveFullName(data);
  const team = data.currentTeamAbbrev ?? data.teamName ?? "";
  const headshot = data.headshot ?? null;
  return {
    title: name,
    description: `Profil Card Scout de ${name}${team ? ` (${team})` : ""} — Score d'investissement, deals eBay et historique de stats.`,
    openGraph: {
      title: `${name} — Card Scout`,
      description: `Score d'investissement, deals eBay et stats pour ${name}.`,
      ...(headshot ? { images: [{ url: headshot, width: 250, height: 250, alt: name }] } : {}),
    },
  };
}

async function PlayerPriceHistorySection({ id }) {
  const data = await getPlayerLandingCached(id);
  if (!data) return null;
  const name = resolveFullName(data);
  return <PlayerPriceHistory playerName={name} />;
}

async function PlayerDealsCta({ id }) {
  const data = await getPlayerLandingCached(id);
  if (!data) return null;
  const name = resolveFullName(data);
  const href = `/deals?player=${encodeURIComponent(name)}`;
  return (
    <div className="pl-deals-cta">
      <Link className="cn-btn cn-btn--accent pl-deals-cta__btn" href={href}>
        Trouver les meilleurs deals pour {name}
        <span aria-hidden> →</span>
      </Link>
    </div>
  );
}

export default async function PlayerPage({ params }) {
  const { id } = await params;
  if (!id || !/^\d+$/.test(String(id))) {
    notFound();
  }

  return (
    <div className="pl-page cinematic">
      <ScrollProgress />
      <Atmosphere />

      <div className="pl-rail">
        <div className="pl-rail__inner">
          <AppNav active={null} />
        </div>
      </div>

      <main className="pl-main">
        <Link className="pl-back" href="/">
          <span aria-hidden>←</span> Accueil
        </Link>

        <Suspense fallback={<PlayerHeroSkeleton />}>
          <PlayerHeroSection id={String(id)} />
        </Suspense>

        <div className="cn-divider cn-divider--dotted" />

        <Suspense fallback={<PlayerStatsHistorySkeleton />}>
          <PlayerStatsHistorySection id={String(id)} />
        </Suspense>

        <div className="cn-divider cn-divider--dotted" />

        <Suspense fallback={null}>
          <PlayerPriceHistorySection id={String(id)} />
        </Suspense>

        <Suspense fallback={null}>
          <PlayerDealsCta id={String(id)} />
        </Suspense>
      </main>
    </div>
  );
}
