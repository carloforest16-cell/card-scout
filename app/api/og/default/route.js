import { ImageResponse } from "next/og";

import { OG_BACKGROUND, OG_SIZE, OgBrand } from "../brand";

export const runtime = "nodejs";
// Contenu fixe : régénéré au plus une fois par jour.
export const revalidate = 86400;

/**
 * Image de partage par défaut (accueil et toutes les pages sans image propre).
 * Remplace /og-default.png, référencé par app/layout.js mais jamais créé :
 * un lien de l'accueil partagé n'avait aucun aperçu (audit 2026-09-23).
 */
export async function GET(request) {
  const origin = new URL(request.url).origin;
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
        <OgBrand origin={origin} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
          <span style={{ fontSize: 84, fontWeight: 900, lineHeight: 1.02, letterSpacing: -2.5, display: "flex", flexDirection: "column" }}>
            <span>Les pros scorent.</span>
            <span style={{ color: "#00D4FF" }}>Les autres espèrent.</span>
          </span>
          <span style={{ fontSize: 30, color: "rgba(229, 231, 235, 0.72)", maxWidth: 900 }}>
            Le Card Metrics Score croise les stats NHL et le marché eBay pour trouver les cartes sous-évaluées.
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
          <span style={{ fontSize: 22, color: "rgba(229, 231, 235, 0.6)" }}>
            100 % gratuit · 900+ joueurs analysés
          </span>
          <span style={{ fontSize: 20, color: "rgba(0, 212, 255, 0.8)", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>
            cardmetrics.io
          </span>
        </div>
      </div>
    ),
    OG_SIZE
  );
}
