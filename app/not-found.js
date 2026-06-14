import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#05060a",
      color: "#e2e8f0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: "2rem",
      fontFamily: "var(--font-dm-sans, sans-serif)",
    }}>
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden style={{ marginBottom: "1.5rem", opacity: 0.7 }}>
        <ellipse cx="36" cy="54" rx="28" ry="6" fill="rgba(0,212,255,0.08)"/>
        <path d="M20 36 C20 24 52 24 52 36 C52 46 44 52 36 56 C28 52 20 46 20 36Z" fill="rgba(0,212,255,0.12)" stroke="rgba(0,212,255,0.5)" strokeWidth="1.5"/>
        <path d="M36 20 L36 44" stroke="rgba(0,212,255,0.7)" strokeWidth="3" strokeLinecap="round"/>
        <circle cx="36" cy="52" r="2.5" fill="#00d4ff"/>
        <path d="M16 14 L36 8 L56 14 L62 34 L36 64 L10 34Z" stroke="rgba(255,255,255,0.1)" strokeWidth="1" fill="none"/>
      </svg>

      <p style={{
        fontFamily: "var(--font-bebas, sans-serif)",
        fontSize: "clamp(4rem, 15vw, 8rem)",
        lineHeight: 1,
        letterSpacing: "0.05em",
        background: "linear-gradient(135deg,#00d4ff,#0070f3)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        margin: "0 0 0.25rem",
      }}>
        404
      </p>

      <h1 style={{ fontSize: "clamp(1.1rem, 3vw, 1.6rem)", fontWeight: 700, margin: "0 0 0.75rem", color: "#f0f6fc" }}>
        Cette page a raté le filet
      </h1>

      <p style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.45)", maxWidth: "380px", lineHeight: 1.6, margin: "0 0 2.5rem" }}>
        La page que tu cherches n&apos;existe pas ou a été déplacée. Retourne à l&apos;action.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/" style={{
          padding: "0.75rem 1.5rem",
          borderRadius: "9px",
          background: "linear-gradient(135deg,#00d4ff,#0070f3)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "0.88rem",
          textDecoration: "none",
          letterSpacing: "0.04em",
        }}>
          Accueil
        </Link>
        <Link href="/deals" style={{
          padding: "0.75rem 1.5rem",
          borderRadius: "9px",
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
          color: "rgba(255,255,255,0.75)",
          fontWeight: 600,
          fontSize: "0.88rem",
          textDecoration: "none",
        }}>
          Deal Finder
        </Link>
      </div>
    </div>
  );
}
