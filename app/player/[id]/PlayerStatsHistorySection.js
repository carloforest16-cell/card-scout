import { notFound } from "next/navigation";

import {
  buildNhlRegularSeasonHistory,
  formatSeasonLabel,
} from "@/lib/nhlPlayerLanding";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";

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

  const gamesPlayed = sub?.gamesPlayed;
  const goals = sub?.goals;
  const assists = sub?.assists;
  const points = sub?.points;

  const stat = (value) =>
    value != null && value !== "" ? String(value) : "—";

  const seasonHistory = buildNhlRegularSeasonHistory(data.seasonTotals);

  return (
    <div className="player-prog-after-hero">
      <section
        className="player__section player-prog-reveal"
        aria-labelledby="player-stats-heading"
      >
        <h2 id="player-stats-heading" className="player__section-title">
          Saison actuelle
          {seasonLabel ? (
            <span className="player__season"> {seasonLabel}</span>
          ) : null}
        </h2>
        <div className="player__stats">
          <div className="player__stat">
            <span className="player__stat-value">{stat(gamesPlayed)}</span>
            <span className="player__stat-label">Matchs joués</span>
          </div>
          <div className="player__stat">
            <span className="player__stat-value">{stat(goals)}</span>
            <span className="player__stat-label">Buts</span>
          </div>
          <div className="player__stat">
            <span className="player__stat-value">{stat(assists)}</span>
            <span className="player__stat-label">Passes</span>
          </div>
          <div className="player__stat player__stat--accent">
            <span className="player__stat-value">{stat(points)}</span>
            <span className="player__stat-label">Points</span>
          </div>
        </div>
      </section>

      <section
        className="player__section player-prog-reveal player-prog-reveal--delay"
        aria-labelledby="player-history-heading"
      >
        <h2 id="player-history-heading" className="player__section-title">
          Historique des saisons
        </h2>
        {seasonHistory.length === 0 ? (
          <p className="player-history__empty">
            Aucune saison NHL (saison régulière) dans les données.
          </p>
        ) : (
          <div className="player-history__wrap">
            <table className="player-history__table">
              <thead>
                <tr>
                  <th scope="col">Saison</th>
                  <th scope="col">Équipe</th>
                  <th scope="col">MJ</th>
                  <th scope="col">Buts</th>
                  <th scope="col">Passes</th>
                  <th scope="col">Points</th>
                  <th scope="col">Pts/match</th>
                </tr>
              </thead>
              <tbody>
                {seasonHistory.map((row) => (
                  <tr
                    key={row.key}
                    className={
                      seasonLabel && row.season === seasonLabel
                        ? "player-history__row--current"
                        : undefined
                    }
                  >
                    <td>{row.season}</td>
                    <td className="player-history__cell-team">{row.team}</td>
                    <td>{row.mj}</td>
                    <td>{row.goals}</td>
                    <td>{row.assists}</td>
                    <td>{row.points}</td>
                    <td>{row.ppg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
