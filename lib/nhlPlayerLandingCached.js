import "server-only";

import { cache } from "react";

import { fetchPlayerLanding } from "@/lib/nhlPlayerLanding";

/** Même promesse par `playerId` dans un même rendu (page + API). */
export const getPlayerLandingCached = cache((playerId) =>
  fetchPlayerLanding(playerId)
);
