"use client";

import { useState } from "react";
import Icon from "./Icons";
import { formatRelativeTime, formatDuration } from "@/lib/timeFormat";

const STATUS_CONFIG = {
  ok: { label: "OK", color: "#22C55E", bg: "rgba(34,197,94,0.12)", dot: true },
  error: { label: "ERREUR", color: "#EF4444", bg: "rgba(239,68,68,0.12)", dot: false },
  idle: { label: "IDLE", color: "#475569", bg: "rgba(71,85,105,0.12)", dot: false },
};

export default function AgentCard({ agent, onDeploy }) {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;

  async function handleDeploy() {
    setLoading(true);
    setLastResult(null);
    try {
      const res = await fetch(`/api/admin/trigger/${agent.id}`, { method: "POST" });
      const data = await res.json();
      setLastResult(data.ok ? { ok: true, duration: data.duration } : { ok: false, error: data.error });
      onDeploy?.();
    } catch {
      setLastResult({ ok: false, error: "Erreur réseau" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        background: "#0e0e10",
        border: "1px solid #2a2a2e",
        borderRadius: "12px",
        padding: "1.25rem",
        transition: "border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease",
        display: "flex",
        flexDirection: "column",
        gap: "0.875rem",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,184,0,0.3)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 32px rgba(255,184,0,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#2a2a2e";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "8px",
            background: "rgba(255,184,0,0.08)", border: "1px solid rgba(255,184,0,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Icon name={agent.icon} size={16} color="#FFB800" />
          </div>
          <span style={{ color: "#E2E8F0", fontWeight: 600, fontSize: "0.9rem" }}>
            {agent.label}
          </span>
        </div>

        {/* Badge statut */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "0.375rem",
          padding: "0.2rem 0.6rem", borderRadius: "999px",
          background: cfg.bg, border: `1px solid ${cfg.color}30`,
          fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em",
          color: cfg.color,
        }}>
          {cfg.dot && (
            <span
              aria-hidden="true"
              style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: cfg.color,
                animation: "adminPulse 1.5s infinite",
                display: "inline-block",
              }}
            />
          )}
          {cfg.label}
        </div>
      </div>

      {/* Métrique */}
      {agent.lastRowsAffected != null && (
        <p style={{ color: "#94A3B8", fontSize: "0.8rem", margin: 0 }}>
          <span style={{ color: "#FFB800", fontWeight: 700, fontSize: "1rem" }}>
            {agent.lastRowsAffected}
          </span>{" "}
          {agent.metricLabel}
        </p>
      )}

      {/* Timestamps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
        <p style={{ color: "#475569", fontSize: "0.75rem", margin: 0 }}>
          Dernier run :{" "}
          <span style={{ color: "#94A3B8" }}>
            {agent.lastRun ? formatRelativeTime(agent.lastRun) : "jamais"}
          </span>
          {agent.lastDurationMs != null && (
            <span style={{ color: "#475569" }}> · {formatDuration(agent.lastDurationMs)}</span>
          )}
        </p>
        {agent.todayRuns > 0 && (
          <p style={{ color: "#475569", fontSize: "0.75rem", margin: 0 }}>
            {"Aujourd'hui :"}{" "}
            <span style={{ color: "#94A3B8" }}>{agent.todayRuns} run{agent.todayRuns > 1 ? "s" : ""}</span>
            {agent.todayErrors > 0 && (
              <span style={{ color: "#EF4444" }}> · {agent.todayErrors} erreur{agent.todayErrors > 1 ? "s" : ""}</span>
            )}
          </p>
        )}
      </div>

      {/* Résultat dernier déclenchement manuel */}
      {lastResult && (
        <div style={{
          padding: "0.4rem 0.75rem",
          borderRadius: "6px",
          background: lastResult.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${lastResult.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          fontSize: "0.75rem",
          color: lastResult.ok ? "#22C55E" : "#EF4444",
        }}>
          {lastResult.ok
            ? `Succès · ${formatDuration(lastResult.duration)}`
            : `Erreur: ${lastResult.error}`}
        </div>
      )}

      {/* Bouton déployer */}
      <button
        onClick={handleDeploy}
        disabled={loading}
        aria-label={`Déployer ${agent.label}`}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
          padding: "0.6rem 1rem",
          background: loading ? "rgba(255,184,0,0.08)" : "transparent",
          border: "1px solid #FFB800",
          borderRadius: "8px",
          color: "#FFB800",
          fontSize: "0.78rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
          transition: "all 0.15s ease",
          minHeight: "44px",
          width: "100%",
        }}
        onMouseEnter={(e) => {
          if (!loading) {
            e.currentTarget.style.background = "#FFB800";
            e.currentTarget.style.color = "#0a0a0b";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "#FFB800";
        }}
      >
        {loading ? (
          <>
            <span style={{ display: "inline-block", animation: "adminSpin 0.8s linear infinite", width: 14, height: 14, border: "2px solid #FFB800", borderTopColor: "transparent", borderRadius: "50%" }} aria-hidden="true" />
            Déploiement…
          </>
        ) : (
          <>
            <Icon name="play" size={14} color="currentColor" />
            Déployer
          </>
        )}
      </button>
    </div>
  );
}
