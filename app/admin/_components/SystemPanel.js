"use client";

import Icon from "./Icons";
import { formatRelativeTime, formatDuration } from "@/lib/timeFormat";

function MetricChip({ icon, label, value, subValue, status }) {
  const statusColor = status === "ok" ? "#22C55E" : status === "error" ? "#EF4444" : "#475569";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "0.75rem",
      padding: "1rem 1.25rem",
      background: "#0e0e10",
      border: "1px solid #2a2a2e",
      borderRadius: "12px",
      flex: "1 1 0",
      minWidth: "180px",
    }}>
      <div style={{
        width: "36px", height: "36px", borderRadius: "9px",
        background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon name={icon} size={16} color="#00D4FF" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: "#475569", fontSize: "0.7rem", margin: "0 0 0.15rem", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>
          {label}
        </p>
        <p style={{ color: "#E2E8F0", fontSize: "0.88rem", fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</p>
        {subValue && (
          <p style={{ color: "#475569", fontSize: "0.72rem", margin: "0.1rem 0 0", whiteSpace: "nowrap" }}>{subValue}</p>
        )}
      </div>
      {status && (
        <div style={{
          width: "8px", height: "8px", borderRadius: "50%",
          background: statusColor, flexShrink: 0,
        }} aria-hidden="true" />
      )}
    </div>
  );
}

export default function SystemPanel({ data }) {
  if (!data) {
    return (
      <div style={{ display: "flex", gap: "1rem" }}>
        {["Supabase", "Cron Health", "eBay API", "DeepSeek"].map((l) => (
          <div key={l} style={{
            flex: "1 1 0", padding: "1rem 1.25rem",
            background: "#0e0e10", border: "1px solid #2a2a2e", borderRadius: "12px",
            color: "#475569", fontSize: "0.8rem",
          }}>
            {l}…
          </div>
        ))}
      </div>
    );
  }

  const { supabase, cron, ebay, deepseek, content } = data;

  // Fraîcheur Top 10
  const opportunitesAge = content?.opportunitesFetchedAt
    ? Math.floor((Date.now() - new Date(content.opportunitesFetchedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const opportunitesStatus = opportunitesAge == null ? "idle" : opportunitesAge >= 14 ? "error" : opportunitesAge >= 7 ? "idle" : "ok";
  const opportunitesLabel = opportunitesAge == null ? "Jamais générées" : `Générées il y a ${opportunitesAge}j`;

  const cronStatus = cron.successRate7d == null ? "idle"
    : cron.successRate7d >= 90 ? "ok"
    : cron.successRate7d >= 70 ? "idle"
    : "error";

  return (
    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
      <MetricChip
        icon="database"
        label="Supabase"
        value={`${supabase.playerScoresCount} joueurs scorés`}
        subValue={`Cache: ${formatRelativeTime(supabase.lastCacheWrite)}`}
        status={supabase.status === "ok" ? "ok" : "error"}
      />
      <MetricChip
        icon="cpu"
        label="Cron Health 7j"
        value={`${cron.successRate7d ?? "—"}% succès · ${cron.total7d ?? 0} runs`}
        subValue={cron.avgDurationMs != null ? `Durée moy. ${formatDuration(cron.avgDurationMs)}` : null}
        status={cronStatus}
      />
      {cron.lastErrors?.length > 0 && (
        <div style={{
          flex: "1 1 0", minWidth: "180px",
          padding: "1rem 1.25rem",
          background: "rgba(239,68,68,0.04)",
          border: "1px solid rgba(239,68,68,0.15)",
          borderRadius: "12px",
        }}>
          <p style={{ color: "#EF4444", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 0.4rem" }}>
            Derniers échecs
          </p>
          {cron.lastErrors.map((e, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.15rem" }}>
              <span style={{ color: "#94A3B8" }}>{e.cronName}</span>
              <span style={{ color: "#475569" }}>{formatRelativeTime(e.ranAt)}</span>
            </div>
          ))}
        </div>
      )}
      <MetricChip
        icon="trophy"
        label="Top 10 Opportunités"
        value={opportunitesLabel}
        subValue={opportunitesAge >= 14 ? "⚠ Refresh recommandé" : null}
        status={opportunitesStatus}
      />
    </div>
  );
}
