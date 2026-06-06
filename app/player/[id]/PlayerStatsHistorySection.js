import { notFound } from "next/navigation";

import {
  buildNhlRegularSeasonHistory,
  formatSeasonLabel,
} from "@/lib/nhlPlayerLanding";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";

import PlayerStatsTabs from "./PlayerStatsTabs";

/**
 * @param {{ id: string }} props
 */
export default async function PlayerStatsHistorySection({ id }) {
  const data = await getPlayerLandingCached(id);
  if (!data) {
    notFound();
  }

  const seasonId = data.featuredStats?.season;
  const seasonLabel = formatSeasonLabel(seasonId);
  const sub = data.featuredStats?.regularSeason?.subSeason;

  const stat = (value) =>
    value != null && value !== "" ? String(value) : "—";

  const current = {
    gp: stat(sub?.gamesPlayed),
    g: stat(sub?.goals),
    a: stat(sub?.assists),
    p: stat(sub?.points),
  };

  const seasonHistory = buildNhlRegularSeasonHistory(data.seasonTotals);

  return (
    <section className="pl-section" aria-labelledby="pl-stats-heading">
      <div className="pl-section__head">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" aria-hidden />
          STATISTIQUES
        </p>
        <h2 id="pl-stats-heading" className="cn-h2">
          PRODUCTION
        </h2>
      </div>
      <PlayerStatsTabs
        seasonLabel={seasonLabel}
        current={current}
        history={seasonHistory}
      />
    </section>
  );
}
