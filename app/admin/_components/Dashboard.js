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
      color: "rgba(255,184,0,0.6)",
      fontSize: "0.7rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      fontVariant: "small-caps",
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
      if (data.ok) setSystem(data);
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
                <Icon name="cpu" size={16} color="#FFB800" />
              </div>
              <div>
                <span style={{ color: "#E2E8F0", fontWeight: 700, fontSize: "0.95rem" }}>
                  Card Metrics
                </span>
                <span style={{ color: "#475569", margin: "0 0.4rem" }}>·</span>
                <span style={{ color: "#FFB800", fontSize: "0.95rem", fontWeight: 600 }}>
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
              <span style={{ color: "#FFB800", fontWeight: 600 }}>{todayRuns}</span>
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
                  border: "1px solid #FFB800",
                  borderRadius: "8px",
                  color: "#FFB800",
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
                onMouseEnter={(e) => { if (!deployingAll) { e.currentTarget.style.background = "#FFB800"; e.currentTarget.style.color = "#0a0a0b"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#FFB800"; }}
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

          {/* Grid 4 colonnes: 2 agents + 1 analytics + 1 system */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gridTemplateRows: "auto",
            gap: "1.5rem",
          }}>

            {/* ═══ SECTION A — AGENTS (colonnes 1-2) ═══ */}
            <div style={{ gridColumn: "1 / 3" }}>
              <SectionTitle>Agents</SectionTitle>
              {agents.length === 0 ? (
                <Card>
                  <p style={{ color: "#475569", textAlign: "center", padding: "1rem 0" }}>
                    Chargement des agents…
                  </p>
                </Card>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
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

            {/* ═══ SECTION B — ANALYTICS (colonne 3) ═══ */}
            <div style={{ gridColumn: "3 / 4" }}>
              <SectionTitle>Analytics</SectionTitle>
              <Card>
                {analytics?.available === false ? (
                  <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                    <div style={{
                      width: "48px", height: "48px", borderRadius: "12px",
                      background: "rgba(71,85,105,0.12)", border: "1px solid #2a2a2e",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      margin: "0 auto 1rem",
                    }}>
                      <Icon name="chart" size={22} color="#475569" />
                    </div>
                    <p style={{ color: "#94A3B8", fontSize: "0.85rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
                      Analytics non configuré
                    </p>
                    <p style={{ color: "#475569", fontSize: "0.78rem", lineHeight: 1.5, margin: 0 }}>
                      Intégrez{" "}
                      <code style={{ background: "#1a1a1e", padding: "0.1rem 0.35rem", borderRadius: "4px", fontSize: "0.72rem", color: "#FFB800" }}>
                        @vercel/analytics
                      </code>{" "}
                      ou une source custom pour activer les métriques de trafic.
                    </p>
                  </div>
                ) : (
                  <p style={{ color: "#475569", fontSize: "0.85rem" }}>Chargement…</p>
                )}
              </Card>
            </div>

            {/* ═══ SECTION C — SYSTÈME (colonne 4) ═══ */}
            <div style={{ gridColumn: "4 / 5" }}>
              <SectionTitle>Système</SectionTitle>
              <Card style={{ padding: "1.25rem 1.5rem" }}>
                <SystemPanel data={system} />
              </Card>
            </div>
          </div>

          {/* Footer: dernière mise à jour */}
          <div style={{
            marginTop: "2rem",
            textAlign: "center",
            color: "#2a2a2e",
            fontSize: "0.75rem",
          }}>
            {lastUpdated
              ? `Mis à jour il y a ${sinceUpdate}s · actualisation automatique toutes les 30s`
              : "Chargement initial…"}
          </div>
        </main>
      </div>
    </>
  );
}
