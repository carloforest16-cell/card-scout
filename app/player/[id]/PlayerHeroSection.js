import { notFound } from "next/navigation";

import {
  resolveFullName,
  resolveHeadshotUrl,
  resolveTeamLabel,
  resolveTeamLogoUrl,
} from "@/lib/nhlPlayerLanding";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";

import PlayerHero from "./PlayerHero";

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
  const headshotUrl = resolveHeadshotUrl(data, id);
  const teamLogoUrl = resolveTeamLogoUrl(data);

  const position = data.position ?? "—";
  const sweater =
    data.sweaterNumber != null && data.sweaterNumber !== ""
      ? `#${data.sweaterNumber}`
      : "—";

  return (
    <PlayerHero
      playerId={id}
      fullName={fullName}
      team={team}
      position={position}
      sweater={sweater}
      headshotUrl={headshotUrl}
      teamLogoUrl={teamLogoUrl}
    />
  );
}
