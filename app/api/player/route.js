import { NextResponse } from "next/server";

/**
 * Recherche joueur NHL (API search nhle.com).
 * L’URL documentée /api/v1/search?q=&type=player renvoie 404 ;
 * l’endpoint actif est /api/v1/search/player avec culture (requis).
 */
const NHL_PLAYER_SEARCH =
  "https://search.d3.nhle.com/api/v1/search/player";

export const dynamic = "force-dynamic";

function mapPlayer(raw) {
  const team =
    raw.teamAbbrev ??
    raw.lastTeamAbbrev ??
    null;

  return {
    playerId: raw.playerId != null ? String(raw.playerId) : null,
    name: raw.name ?? null,
    team,
    position: raw.positionCode ?? null,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: "Paramètre requis : q (nom du joueur)" },
      { status: 400 }
    );
  }

  const nhlUrl = new URL(NHL_PLAYER_SEARCH);
  nhlUrl.searchParams.set("q", q);
  nhlUrl.searchParams.set("culture", "fr");

  let upstream;
  try {
    upstream = await fetch(nhlUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "CardScout/1.0",
      },
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Impossible de joindre l’API NHL", detail: String(err?.message ?? err) },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json(
      {
        error: "Réponse NHL invalide",
        status: upstream.status,
        detail: text.slice(0, 500),
      },
      { status: 502 }
    );
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return NextResponse.json(
      { error: "Réponse NHL non JSON" },
      { status: 502 }
    );
  }

  if (!Array.isArray(data)) {
    return NextResponse.json(
      { error: "Format de réponse NHL inattendu" },
      { status: 502 }
    );
  }

  const results = data.map(mapPlayer);

  return NextResponse.json({ results });
}
