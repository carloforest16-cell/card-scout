/**
 * En-tête de marque partagé par les images de partage (next/og). Le logo est
 * l'icône PNG du site (public/icon-192.png), chargée par URL absolue : satori
 * sait récupérer une image distante, et on évite un emoji en guise de logo.
 * @param {{ origin: string }} props
 */
export function OgBrand({ origin }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${origin}/icon-192.png`} alt="" width={60} height={60} style={{ borderRadius: 14 }} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5, display: "flex" }}>
          <span style={{ color: "#fff" }}>Card</span>
          <span style={{ color: "#00D4FF" }}>Metrics</span>
        </span>
        <span style={{ fontSize: 16, color: "rgba(229, 231, 235, 0.55)", textTransform: "uppercase", letterSpacing: 4 }}>
          Intelligence cartes NHL
        </span>
      </div>
    </div>
  );
}

export const OG_SIZE = { width: 1200, height: 630 };

export const OG_BACKGROUND = {
  background: "linear-gradient(135deg, #05060A 0%, #0A0E17 50%, #0F172A 100%)",
  glow:
    "radial-gradient(60% 50% at 80% 20%, rgba(0, 212, 255, 0.18), transparent 60%), radial-gradient(50% 50% at 20% 100%, rgba(255, 184, 0, 0.12), transparent 60%)",
};
