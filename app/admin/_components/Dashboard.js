"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AgentCard from "./AgentCard";
import SystemPanel from "./SystemPanel";
import Icon from "./Icons";

const AGENT_POLL_MS = 30_000;
const SYSTEM_POLL_MS = 30_000;
const ANALYTICS_POLL_MS = 5 * 60_000;

function SectionTitle({ children }) {
  return (
    <h2 style={{
      color: "rgba(0,212,255,0.5)",
      fontSize: "0.7rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      margin: "0 0 1rem",
    }}>
      {children}
    </h2>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: "#0e0e10",
      border: "1px solid #2a2a2e",
      borderRadius: "12px",
      padding: "1.5rem",
      ...style,
    }}>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [agents, setAgents] = useState([]);
  const [meta, setMeta] = useState(null);
  const [system, setSystem] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [deployingAll, setDeployingAll] = useState(false);
  const hiddenRef = useRef(false);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("fr-CA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/agents");
      if (res.status === 401) { router.push("/admin/login"); return; }
      const data = await res.json();
      if (data.ok) {
        setAgents(data.agents ?? []);
        setMeta(data.meta ?? null);
        setLastUpdated(new Date());
      }
    } catch { /* ignore */ }
  }, [router]);

  const fetchSystem = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/system");
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        setSystem(data);
        setAnalytics(data.analytics ?? null);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/analytics");
      if (!res.ok) return;
      const data = await res.json();
      setAnalytics(data);
    } catch { /* ignore */ }
  }, []);

  // Chargement initial
  useEffect(() => {
    fetchAgents();
    fetchSystem();
    fetchAnalytics();
  }, [fetchAgents, fetchSystem, fetchAnalytics]);

  // Polling — pause si onglet caché
  useEffect(() => {
    const handleVisibility = () => {
      hiddenRef.current = document.hidden;
      if (!document.hidden) {
        fetchAgents();
        fetchSystem();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const agentTimer = setInterval(() => {
      if (!hiddenRef.current) fetchAgents();
    }, AGENT_POLL_MS);

    const systemTimer = setInterval(() => {
      if (!hiddenRef.current) fetchSystem();
    }, SYSTEM_POLL_MS);

    const analyticsTimer = setInterval(() => {
      if (!hiddenRef.current) fetchAnalytics();
    }, ANALYTICS_POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(agentTimer);
      clearInterval(systemTimer);
      clearInterval(analyticsTimer);
    };
  }, [fetchAgents, fetchSystem, fetchAnalytics]);

  // Timer "Mis à jour il y a Xs"
  const [sinceUpdate, setSinceUpdate] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) {
        setSinceUpdate(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  async function handleDeployAll() {
    if (!window.confirm("Déclencher TOUS les agents en séquence ?\n\nCela peut prendre plusieurs minutes.")) return;
    setDeployingAll(true);
    try {
      for (const agent of agents) {
        await fetch(`/api/admin/trigger/${agent.id}`, { method: "POST" });
      }
      await fetchAgents();
    } finally {
      setDeployingAll(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  const activeCount = meta?.activeAgents ?? 0;
  const totalCount = meta?.totalAgents ?? 0;
  const todayRuns = meta?.todayRuns ?? 0;

  return (
    <>
      {/* Keyframes globaux */}
      <style>{`
        @keyframes adminPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        @keyframes adminSpin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>

      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0a0a0b 0%, #000000 100%)",
        color: "#E2E8F0",
        fontFamily: "var(--cn-body, system-ui, sans-serif)",
        WebkitFontSmoothing: "antialiased",
      }}>

        {/* Header sticky */}
        <header style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(10,10,11,0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1a1a1e",
          padding: "0 1.5rem",
        }}>
          <div style={{
            maxWidth: "1400px", margin: "0 auto",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: "64px", gap: "1rem",
          }}>
            {/* Gauche: titre */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "7px",
                background: "rgba(255,184,0,0.15)", border: "1px solid rgba(255,184,0,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="cpu" size={16} color="#00D4FF" />
              </div>
              <div>
                <span style={{ color: "#E2E8F0", fontWeight: 700, fontSize: "0.95rem" }}>
                  Card Metrics
                </span>
                <span style={{ color: "#475569", margin: "0 0.4rem" }}>·</span>
                <span style={{ color: "#00D4FF", fontSize: "0.95rem", fontWeight: 600 }}>
                  Mission Control
                </span>
              </div>
            </div>

            {/* Centre: stats */}
            <div style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              color: "#94A3B8", fontSize: "0.8rem",
            }}>
              <span style={{ color: "#22C55E", fontWeight: 700 }}>{activeCount}</span>
              <span>/{totalCount} agents actifs</span>
              <span style={{ color: "#2a2a2e" }}>·</span>
              <span style={{ color: "#00D4FF", fontWeight: 600 }}>{todayRuns}</span>
              <span>{"runs aujourd'hui"}</span>
            </div>

            {/* Droite: actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ color: "#2a2a2e", fontSize: "0.75rem", display: "none" /* masqué mobile */ }}>
                {dateLabel}
              </span>

              <button
                onClick={handleDeployAll}
                disabled={deployingAll}
                style={{
                  display: "flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.5rem 1rem",
                  background: "transparent",
                  border: "1px solid #00D4FF",
                  borderRadius: "8px",
                  color: "#00D4FF",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: deployingAll ? "not-allowed" : "pointer",
                  opacity: deployingAll ? 0.6 : 1,
                  transition: "all 0.15s ease",
                  minHeight: "44px",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { if (!deployingAll) { e.currentTarget.style.background = "#00D4FF"; e.currentTarget.style.color = "#0a0a0b"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#00D4FF"; }}
              >
                {deployingAll ? "En cours…" : "Tout déployer"}
              </button>

              <button
                onClick={handleLogout}
                aria-label="Déconnexion"
                style={{
                  padding: "0.5rem",
                  background: "transparent",
                  border: "1px solid #2a2a2e",
                  borderRadius: "8px",
                  color: "#475569",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s ease",
                  minHeight: "44px", minWidth: "44px",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#EF4444"; e.currentTarget.style.color = "#EF4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2e"; e.currentTarget.style.color = "#475569"; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Contenu principal */}
        <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>

          {/* ═══ SYSTÈME — barre horizontale en haut ═══ */}
          <div style={{ marginBottom: "2rem" }}>
            <SectionTitle>Système</SectionTitle>
            <SystemPanel data={system} horizontal />
          </div>

          {/* ═══ BUSINESS + ANALYTICS ═══ */}
          <div style={{ marginBottom: "2rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>

            {/* Business */}
            <div>
              <SectionTitle>Utilisateurs</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
                {[
                  { label: "Abonnés newsletter", value: system?.business?.subscribersTotal ?? "—", sub: system?.business?.subscribersToday > 0 ? `+${system.business.subscribersToday} aujourd'hui` : null, color: "#00D4FF" },
                  { label: "Alertes prix actives", value: system?.business?.activeAlerts ?? "—", sub: `${system?.business?.alertsTriggered7d ?? 0} déclenchées (7j)`, color: "#22C55E" },
                  { label: "Watchlist items", value: system?.business?.watchlistItems ?? "—", sub: null, color: "#00D4FF" },
                  { label: "Clics eBay (7j)", value: system?.business?.ebayClicks7d ?? "—", sub: `${system?.business?.ebayClicksTotal ?? 0} total`, color: "#94A3B8" },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} style={{
                    background: "#0e0e10", border: "1px solid #2a2a2e", borderRadius: "12px",
                    padding: "1rem 1.25rem",
                  }}>
                    <p style={{ color: "#475569", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 0.4rem" }}>{label}</p>
                    <p style={{ color, fontSize: "1.6rem", fontWeight: 700, margin: 0, lineHeight: 1 }}>{value}</p>
                    {sub && <p style={{ color: "#475569", fontSize: "0.72rem", margin: "0.3rem 0 0" }}>{sub}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Analytics trafic */}
            <div>
              <SectionTitle>Trafic</SectionTitle>
              <Card style={{ padding: "1.25rem" }}>
                {!analytics ? (
                  <p style={{ color: "#475569", fontSize: "0.85rem" }}>Chargement…</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {/* Vues aujourd'hui */}
                    <div>
                      <p style={{ color: "#475569", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 0.25rem" }}>Pages vues aujourd&apos;hui</p>
                      <p style={{ color: "#00D4FF", fontSize: "2rem", fontWeight: 700, margin: 0, lineHeight: 1 }}>{analytics.todayViews}</p>
                    </div>

                    {/* Bar chart 7j */}
                    {analytics.weekly?.length > 0 && (
                      <div>
                        <p style={{ color: "#475569", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 0.5rem" }}>7 derniers jours</p>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "48px" }}>
                          {(() => {
                            const max = Math.max(...analytics.weekly.map(d => d.count), 1);
                            return analytics.weekly.map(({ date, count }) => (
                              <div key={date} title={`${date} — ${count} vues`} style={{
                                flex: 1, height: `${Math.max((count / max) * 100, 4)}%`,
                                background: "rgba(0,212,255,0.4)", borderRadius: "3px 3px 0 0",
                                minHeight: "3px",
                              }} />
                            ));
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Top pages */}
                    {analytics.topPages?.length > 0 && (
                      <div>
                        <p style={{ color: "#475569", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 0.5rem" }}>Top pages</p>
                        {analytics.topPages.map(({ path, count }) => (
                          <div key={path} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                            <span style={{ color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{path}</span>
                            <span style={{ color: "#00D4FF", fontWeight: 600 }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {analytics.todayViews === 0 && analytics.weekly?.length === 0 && (
                      <p style={{ color: "#475569", fontSize: "0.8rem" }}>Tracking actif — les vues apparaîtront dès la prochaine visite sur le site.</p>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* ═══ AGENTS — pleine largeur, 3 colonnes ═══ */}
          <div>
            <SectionTitle>Agents ({agents.length})</SectionTitle>
            {agents.length === 0 ? (
              <Card>
                <p style={{ color: "#475569", textAlign: "center", padding: "1rem 0" }}>
                  Chargement des agents…
                </p>
              </Card>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "1rem",
              }}>
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onDeploy={fetchAgents}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ marginTop: "2rem", textAlign: "center", color: "#2a2a2e", fontSize: "0.75rem" }}>
            {lastUpdated
              ? `Mis à jour il y a ${sinceUpdate}s · actualisation automatique toutes les 30s`
              : "Chargement initial…"}
          </div>
        </main>
      </div>
    </>
  );
}
