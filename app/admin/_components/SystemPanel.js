"use client";

import Icon from "./Icons";
import { formatRelativeTime, formatDuration } from "@/lib/timeFormat";

function MetricRow({ icon, label, value, subValue, status }) {
  const statusColor = status === "ok" ? "#22C55E" : status === "error" ? "#EF4444" : "#475569";

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: "0.75rem",
      padding: "0.875rem 0",
      borderBottom: "1px solid #1a1a1e",
    }}>
      <div style={{
        width: "32px", height: "32px", borderRadius: "8px",
        background: "rgba(255,184,0,0.06)", border: "1px solid rgba(255,184,0,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px",
      }}>
        <Icon name={icon} size={15} color="#FFB800" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#475569", fontSize: "0.72rem", margin: "0 0 0.2rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {label}
        </p>
        <p style={{ color: "#E2E8F0", fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>{value}</p>
        {subValue && (
          <p style={{ color: "#475569", fontSize: "0.75rem", margin: "0.1rem 0 0" }}>{subValue}</p>
        )}
      </div>
      {status && (
        <div style={{
          width: "8px", height: "8px", borderRadius: "50%",
          background: statusColor, flexShrink: 0, marginTop: "4px",
        }} aria-hidden="true" />
      )}
    </div>
  );
}

export default function SystemPanel({ data }) {
  if (!data) {
    return (
      <div style={{ color: "#475569", fontSize: "0.85rem", textAlign: "center", padding: "2rem 0" }}>
        Chargement…
      </div>
    );
  }

  const { supabase, cron, ebay, deepseek } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <MetricRow
        icon="database"
        label="Supabase — player_scores"
        value={`${supabase.playerScoresCount} joueurs scorés`}
        subValue={`Dernier cache: ${formatRelativeTime(supabase.lastCacheWrite)}`}
        status={supabase.status === "ok" ? "ok" : "error"}
      />

      <MetricRow
        icon="cpu"
        label="Cron Health (7 jours)"
        value={supabase.playerScoresCount !== null
          ? `${cron.successRate7d ?? "—"}% succès · ${cron.total7d} runs`
          : "—"}
        subValue={cron.avgDurationMs != null ? `Durée moy.: ${formatDuration(cron.avgDurationMs)}` : null}
        status={
          cron.successRate7d == null ? "idle"
            : cron.successRate7d >= 90 ? "ok"
              : cron.successRate7d >= 70 ? "idle"
                : "error"
        }
      />

      {cron.lastErrors?.length > 0 && (
        <div style={{
          padding: "0.75rem",
          margin: "0.5rem 0",
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.15)",
          borderRadius: "8px",
        }}>
          <p style={{ color: "#EF4444", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 0.5rem" }}>
            Derniers échecs
          </p>
          {cron.lastErrors.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.2rem" }}>
              <span style={{ color: "#94A3B8" }}>{e.cronName}</span>
              <span style={{ color: "#475569" }}>{formatRelativeTime(e.ranAt)}</span>
            </div>
          ))}
        </div>
      )}

      <MetricRow
        icon="tag"
        label="eBay API"
        value={ebay.note}
        status="idle"
      />

      <MetricRow
        icon="star"
        label="DeepSeek"
        value={deepseek.note}
        status="idle"
      />
    </div>
  );
}
