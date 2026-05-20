import { NextResponse } from "next/server";

import {
  buildScorePayloadFromLanding,
  scoreCardScoutWithClaude,
  validateScoreRequestBody,
} from "@/lib/cardScoutScore";
import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";

export const maxDuration = 60;

/**
 * POST — body JSON : payload complet (buildScorePayloadFromLanding)
 * ou minimal `{ "playerId": "8478402" }` (hydratation NHL côté serveur).
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON invalide" },
      { status: 400 }
    );
  }

  const validated = validateScoreRequestBody(body);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error },
      { status: 400 }
    );
  }

  let payload = validated.payload;
  if (validated.needsHydration) {
    const data = await getPlayerLandingCached(String(payload.playerId));
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Joueur introuvable" },
        { status: 404 }
      );
    }
    payload = buildScorePayloadFromLanding(String(payload.playerId), data);
  }

  const result = await scoreCardScoutWithClaude(payload);
  const status = result.ok ? 200 : 503;
  return NextResponse.json(result, { status });
}