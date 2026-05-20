import { notFound } from "next/navigation";

import {
  resolveFullName,
  resolveHeadshotUrl,
  resolveTeamLabel,
  resolveTeamLogoUrl,
} from "@/lib/nhlPlayerLanding";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";

/**
 * @param {{ id: string }} props
 */
export default async function PlayerHeroSection({ id }) {
  const data = await getPlayerLandingCached(id);
  if (!data) {
    notFound();
  }

  const fullName = resolveFullName(data);
  const team = resolveTeamLabel(data);
  const teamAbbrev = data.currentTeamAbbrev || data.lastTeamAbbrev || null;
  const headshotUrl = resolveHeadshotUrl(data, id);
  const teamLogoUrl = resolveTeamLogoUrl(data);

  const position = data.position ?? "—";
  const sweater =
    data.sweaterNumber != null && data.sweaterNumber !== ""
      ? `#${data.sweaterNumber}`
      : "—";

  return (
    <header className="player-hero">
      <div className="player-hero__glow" aria-hidden="true" />
      <div className="player-hero__layout">
        <div className="player-hero__photo-card">
          <div className="player-hero__photo-frame">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL NHLE */}
            <img
              className="player-hero__photo"
              src={headshotUrl}
              alt={`Portrait ${fullName}`}
              width={320}
              height={400}
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <span className="player-hero__card-brand" aria-hidden="true">
            NHL
          </span>
        </div>

        <div className="player-hero__panel">
          <div className="player-hero__headline">
            <h1 className="player-hero__name">{fullName}</h1>
            {teamLogoUrl ? (
              <div className="player-hero__logo-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="player-hero__logo"
                  src={teamLogoUrl}
                  alt={teamAbbrev ? `Logo ${teamAbbrev}` : "Logo équipe"}
                  width={72}
                  height={72}
                  loading="lazy"
                />
              </div>
            ) : null}
          </div>

          <p className="player-hero__team">{team}</p>

          <dl className="player-hero__chips">
            <div className="player-hero__chip">
              <dt className="visually-hidden">Position</dt>
              <dd>{position}</dd>
            </div>
            <div className="player-hero__chip">
              <dt className="visually-hidden">Numéro</dt>
              <dd>{sweater}</dd>
            </div>
          </dl>
        </div>
      </div>
    </header>
  );
}
