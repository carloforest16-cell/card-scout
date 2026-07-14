export const metadata = {
  title: "Hors ligne",
};

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#05060A",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p style={{ fontSize: "0.78rem", letterSpacing: "0.1em", color: "#00D4FF", marginBottom: "1rem" }}>
        CARD METRICS
      </p>
      <h1 style={{ fontSize: "clamp(1.4rem, 4vw, 2rem)", fontWeight: 700, margin: "0 0 0.75rem" }}>
        Pas de connexion
      </h1>
      <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.55)", maxWidth: "380px", lineHeight: 1.6 }}>
        Cette page a besoin d&apos;internet pour charger les données en temps réel. Reconnecte-toi et réessaie.
      </p>
    </div>
  );
}
