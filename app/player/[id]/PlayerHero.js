"use client";

import SpatialPlayerShowcase from "@/components/ui/spatial-player-showcase";

export default function PlayerHero({
  playerId,
  fullName,
  team,
  position,
  sweater,
  headshotUrl,
  teamLogoUrl,
}) {
  return (
    <SpatialPlayerShowcase
      playerId={playerId}
      fullName={fullName}
      team={team}
      position={position}
      sweater={sweater}
      headshotUrl={headshotUrl}
      teamLogoUrl={teamLogoUrl}
    />
  );
}
