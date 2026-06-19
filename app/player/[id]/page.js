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

import ShareButton from "../../components/ShareButton";
import PlayerHeroSection from "./PlayerHeroSection";
import PlayerPriceHistory from "./PlayerPriceHistory";
import {
  PlayerHeroSkeleton,
  PlayerStatsHistorySkeleton,
} from "./PlayerSkeletons";
import PlayerStatsHistorySection from "./PlayerStatsHistorySection";
import ScoreChangeExplainer from "./ScoreChangeExplainer";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await getPlayerLandingCached(id);
  if (!data) {
    return { title: "Joueur introuvable" };
  }
  const name = resolveFullName(data);
  const team = data.currentTeamAbbrev ?? data.teamName ?? "";
  const ogUrl = `/api/og/player/${id}`;
  return {
    title: name,
    description: `Profil Card Scout de ${name}${team ? ` (${team})` : ""} — Score d'investissement, deals eBay et historique de stats.`,
    openGraph: {
      title: `${name} — Card Scout`,
      description: `Score d'investissement, deals eBay et stats pour ${name}.`,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: `${name} — Card Scout` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} — Card Scout`,
      description: `Score d'investissement, deals eBay et stats pour ${name}.`,
      images: [ogUrl],
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
  const compareHref = `/compare?ids=${encodeURIComponent(id)}`;
  return (
    <div className="pl-deals-cta">
      <Link className="cn-btn cn-btn--accent pl-deals-cta__btn" href={href}>
        Trouver les meilleurs deals pour {name}
        <span aria-hidden> →</span>
      </Link>
      <Link className="cn-btn cn-btn--ghost pl-deals-cta__btn" href={compareHref} style={{ marginTop: "0.6rem" }}>
        Comparer à un autre joueur
        <span aria-hidden> →</span>
      </Link>
      <ShareButton
        title={`${name} — Card Scout`}
        text={`${name} sur Card Scout — score d'investissement et deals eBay en temps réel.`}
        className="cn-btn cn-btn--ghost pl-deals-cta__btn"
      />
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

        <ScoreChangeExplainer playerId={String(id)} />

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
