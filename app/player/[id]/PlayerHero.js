"use client";

import { useEffect } from "react";

import SpatialPlayerShowcase from "@/components/ui/spatial-player-showcase";
import { pushRecentPlayer } from "@/lib/useRecentPlayers";

export default function PlayerHero({
  playerId,
  fullName,
  team,
  position,
  sweater,
  headshotUrl,
  teamLogoUrl,
}) {
  useEffect(() => {
    if (!playerId || !fullName) return;
    pushRecentPlayer({ id: playerId, name: fullName, headshotUrl, team });
  }, [playerId, fullName, headshotUrl, team]);

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
