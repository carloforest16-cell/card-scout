import { ImageResponse } from "next/og";

import { getPlayerLandingCached } from "@/lib/nhlPlayerLandingCached";
import { resolveFullName } from "@/lib/nhlPlayerLanding";
import { getStoredPlayerScore } from "@/lib/playerScores";

import { OG_BACKGROUND, OG_SIZE, OgBrand } from "../../brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TIER_LABEL = { high: "Élevé", medium: "Moyen", mid: "Moyen", low: "Faible" };

export async function GET(request, { params }) {
  const { id } = await params;
  if (!id || !/^\d+$/.test(String(id))) {
    return new Response("invalid", { status: 400 });
  }

  const [landing, stored] = await Promise.all([
    getPlayerLandingCached(String(id)).catch(() => null),
    getStoredPlayerScore(String(id)).catch(() => null),
  ]);

  const name = landing ? resolveFullName(landing) : "Joueur NHL";
  const team = landing?.currentTeamAbbrev ?? landing?.teamName ?? null;
  const position = landing?.position ?? landing?.positionCode ?? null;
  const score = stored?.data?.score;
  const tier = stored?.data?.tier;
  const headshot = landing?.headshot ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: OG_BACKGROUND.background,
          padding: "64px 72px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#fff",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: OG_BACKGROUND.glow }} />

        <OgBrand origin={new URL(request.url).origin} />

        {/* Main */}
        <div style={{ display: "flex", alignItems: "center", gap: 56, position: "relative" }}>
          {headshot && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headshot}
              alt=""
              width={260}
              height={260}
              style={{
                borderRadius: 9999,
                border: "4px solid rgba(0, 212, 255, 0.45)",
                boxShadow: "0 0 80px rgba(0, 212, 255, 0.25)",
              }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            <span style={{ fontSize: 22, color: "#00D4FF", textTransform: "uppercase", letterSpacing: 6, fontWeight: 700 }}>
              {team ?? "—"} {position ? `· ${position}` : ""}
            </span>
            <span style={{ fontSize: 88, fontWeight: 900, lineHeight: 1, letterSpacing: -2.5 }}>
              {name}
            </span>
            {Number.isFinite(Number(score)) && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 12 }}>
                <span style={{ fontSize: 28, color: "rgba(229, 231, 235, 0.6)" }}>Card Metrics Score</span>
                <span style={{ fontSize: 96, fontWeight: 900, color: "#FFB800", letterSpacing: -3, lineHeight: 1 }}>
                  {Number(score).toFixed(1)}
                </span>
                <span style={{ fontSize: 32, color: "rgba(229, 231, 235, 0.6)" }}>/10</span>
                {tier && (
                  <span style={{ fontSize: 22, padding: "10px 18px", borderRadius: 999, background: "rgba(255, 184, 0, 0.12)", color: "#FFB800", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>
                    {TIER_LABEL[tier] ?? tier}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
          <span style={{ fontSize: 22, color: "rgba(229, 231, 235, 0.6)" }}>
            {"Score d'investissement, deals eBay et stats NHL"}
          </span>
          <span style={{ fontSize: 18, color: "rgba(0, 212, 255, 0.7)", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>
            cardmetrics.io
          </span>
        </div>
      </div>
    ),
    OG_SIZE
  );
}
