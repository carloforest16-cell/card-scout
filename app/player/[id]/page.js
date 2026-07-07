import "../../cinematic.css";
import "../../components/alert-button.css";
import "../../components/follow-button.css";
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
import {
  PlayerHeroSkeleton,
  PlayerStatsHistorySkeleton,
} from "./PlayerSkeletons";
import PlayerStatsHistorySection from "./PlayerStatsHistorySection";
import PeerComparison from "./PeerComparison";

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
    description: `Profil Card Metrics de ${name}${team ? ` (${team})` : ""} — Score d'investissement, deals eBay et historique de stats.`,
    openGraph: {
      title: `${name} — Card Metrics`,
      description: `Score d'investissement, deals eBay et stats pour ${name}.`,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: `${name} — Card Metrics` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${name} — Card Metrics`,
      description: `Score d'investissement, deals eBay et stats pour ${name}.`,
      images: [ogUrl],
    },
  };
}

async function PlayerDealsCta({ id }) {
  const data = await getPlayerLandingCached(id);
  if (!data) return null;
  const name = resolveFullName(data);
  const href = `/deals?player=${encodeURIComponent(name)}`;
  // /compare fusionné dans /deals (tâche 5.2) — pré-remplit le joueur 1 et
  // ouvre directement le champ de saisie du 2e joueur.
  const compareHref = `/deals?player=${encodeURIComponent(name)}&startCompare=1`;
  return (
    <div className="pl-cta">
      <Link className="pl-cta__primary" href={href}>
        <svg className="pl-cta__primary-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="pl-cta__primary-text">
          Meilleurs deals
          <span className="pl-cta__primary-name">pour {name}</span>
        </span>
        <span className="pl-cta__primary-arrow" aria-hidden>→</span>
      </Link>

      <div className="pl-cta__row">
        <Link className="pl-cta__secondary" href={compareHref}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
          <span>Comparer</span>
        </Link>
        <ShareButton
          title={`${name} — Card Metrics`}
          text={`${name} sur Card Metrics — score d'investissement et deals eBay en temps réel.`}
          className="pl-cta__secondary"
        />
      </div>
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

        <PeerComparison playerId={String(id)} />

        <div className="cn-divider cn-divider--dotted" />

        <Suspense fallback={<PlayerStatsHistorySkeleton />}>
          <PlayerStatsHistorySection id={String(id)} />
        </Suspense>

        <div className="cn-divider cn-divider--dotted" />

        <Suspense fallback={null}>
          <PlayerDealsCta id={String(id)} />
        </Suspense>
      </main>
    </div>
  );
}
