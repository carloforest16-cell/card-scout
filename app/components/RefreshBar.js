"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./refresh-bar.css";

function timeAgo(ts) {
  if (!ts) return null;
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  return `Il y a ${Math.floor(diff / 86400)} j`;
}

/**
 * @param {{ onRefresh: () => Promise<void>; label?: string; lastUpdatedAt?: number | null }} props
 */
export default function RefreshBar({ onRefresh, label = "Données", lastUpdatedAt = null }) {
  const [ts, setTs] = useState(() => lastUpdatedAt ?? Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [display, setDisplay] = useState(() => timeAgo(lastUpdatedAt ?? Date.now()));
  const intervalRef = useRef(null);

  // Sync with parent-supplied timestamp (e.g. cache age from API)
  useEffect(() => {
    if (lastUpdatedAt && lastUpdatedAt !== ts) setTs(lastUpdatedAt);
  }, [lastUpdatedAt, ts]);

  useEffect(() => {
    setDisplay(timeAgo(ts));
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setDisplay(timeAgo(ts)), 30_000);
    return () => clearInterval(intervalRef.current);
  }, [ts]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } catch { /* ignore */ }
    setTs(Date.now());
    setRefreshing(false);
  }, [onRefresh, refreshing]);

  return (
    <div className="rb-bar" aria-live="polite">
      <span className="rb-label">
        {label} · <span className="rb-time">{display}</span>
      </span>
      <button
        type="button"
        className={`rb-btn${refreshing ? " rb-btn--spin" : ""}`}
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="Rafraîchir"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rb-icon" aria-hidden>
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
          <path d="M8 16H3v5"/>
        </svg>
        {refreshing ? "Mise à jour…" : "Rafraîchir"}
      </button>
    </div>
  );
}
