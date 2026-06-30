"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/admin";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (data.ok) {
        router.push(from);
      } else {
        setError(data.error ?? "Mot de passe incorrect");
        setPassword("");
      }
    } catch {
      setError("Erreur réseau — réessayez");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #05060A 0%, #0A0E17 100%)" }}>
      <div className="w-full max-w-sm px-6">
        {/* Logo / titre */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <rect width="28" height="28" rx="6" fill="#FFB800" fillOpacity="0.15"/>
              <path d="M14 5L18.5 9.5H23L19.5 14L23 18.5H18.5L14 23L9.5 18.5H5L8.5 14L5 9.5H9.5L14 5Z" fill="#FFB800" fillOpacity="0.9"/>
            </svg>
            <span style={{ color: "#FFB800", fontFamily: "var(--cn-display, sans-serif)", fontSize: "1.1rem", fontWeight: 600, letterSpacing: "0.04em" }}>
              Card Metrics
            </span>
          </div>
          <h1 style={{ color: "#E2E8F0", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>
            Mission Control
          </h1>
          <p style={{ color: "#475569", fontSize: "0.875rem" }}>Accès administrateur</p>
        </div>

        {/* Carte formulaire */}
        <div style={{
          background: "#0e0e10",
          border: "1px solid #2a2a2e",
          borderRadius: "14px",
          padding: "2rem",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}>
          <form onSubmit={handleSubmit} noValidate>
            <label
              htmlFor="password"
              style={{ display: "block", color: "#94A3B8", fontSize: "0.8rem", fontWeight: 500, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                background: "#0a0a0b",
                border: `1px solid ${error ? "#EF4444" : "#2a2a2e"}`,
                borderRadius: "8px",
                color: "#E2E8F0",
                fontSize: "1rem",
                outline: "none",
                marginBottom: "0.5rem",
                transition: "border-color 0.15s ease",
              }}
              onFocus={(e) => {
                if (!error) e.target.style.borderColor = "rgba(255,184,0,0.5)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = error ? "#EF4444" : "#2a2a2e";
              }}
            />

            {error && (
              <p role="alert" style={{ color: "#EF4444", fontSize: "0.8rem", marginBottom: "1rem" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              style={{
                width: "100%",
                padding: "0.8rem",
                marginTop: "1rem",
                background: loading ? "rgba(255,184,0,0.1)" : "transparent",
                border: "1px solid #FFB800",
                borderRadius: "8px",
                color: "#FFB800",
                fontSize: "0.9rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: loading || !password ? "not-allowed" : "pointer",
                opacity: loading || !password ? 0.6 : 1,
                transition: "all 0.15s ease",
                minHeight: "44px",
              }}
              onMouseEnter={(e) => {
                if (!loading && password) {
                  e.target.style.background = "#FFB800";
                  e.target.style.color = "#0a0a0b";
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "transparent";
                e.target.style.color = "#FFB800";
              }}
            >
              {loading ? "Connexion…" : "Accéder"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", color: "#2a2a2e", fontSize: "0.75rem", marginTop: "2rem" }}>
          Card Metrics · Administration
        </p>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
