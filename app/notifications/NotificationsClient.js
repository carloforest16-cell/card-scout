"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import EmptyState from "../components/EmptyState";
import Reveal from "../components/Reveal";

import "../components/empty-state.css";

const FILTERS = [
  { id: "all", label: "Toutes" },
  { id: "unread", label: "Non lues" },
  { id: "price_alert", label: "Alertes prix" },
  { id: "weekly_pick", label: "Picks" },
  { id: "opp_new", label: "Opportunités" },
  { id: "system", label: "Système" },
];

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-CA", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function NotificationsClient({ initialItems }) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((n) => !n.read_at);
    return items.filter((n) => n.type === filter);
  }, [items, filter]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  async function markAsRead(id) {
    const snapshot = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read_at: new Date().toISOString() } : x)));
    try {
      const r = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, read: true }),
      });
      if (!r.ok) throw new Error("fail");
    } catch {
      setItems(snapshot);
    }
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    setBusy(true);
    const snapshot = items;
    const now = new Date().toISOString();
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? now })));
    try {
      const r = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!r.ok) throw new Error("fail");
    } catch {
      setItems(snapshot);
    } finally {
      setBusy(false);
    }
  }

  async function deleteOne(id) {
    const snapshot = items;
    setItems((xs) => xs.filter((x) => x.id !== id));
    try {
      const r = await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("fail");
    } catch {
      setItems(snapshot);
    }
  }

  return (
    <>
      <Reveal as="header" className="notifs-hero">
        <p className="cn-eyebrow"><span className="cn-eyebrow__dot" />INBOX</p>
        <h1 className="cn-h1 notifs-title">
          Notifications
          {unreadCount > 0 && <span className="notifs-title__badge">{unreadCount}</span>}
        </h1>
        <p className="notifs-sub">
          Tout ce que Card Metrics détecte pour toi — alertes prix, picks
          hebdomadaires, nouvelles opportunités.
        </p>
      </Reveal>

      <div className="notifs-toolbar">
        <div className="notifs-filters" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`notifs-filter ${filter === f.id ? "notifs-filter--active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            className="notifs-action"
            onClick={markAllRead}
            disabled={busy}
          >
            Tout marquer lu
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          }
          title={filter === "all" ? "Aucune notification" : "Rien dans ce filtre"}
          description={
            filter === "all"
              ? "Tu recevras ici les alertes de prix, les picks hebdo et les nouvelles opportunités dès qu'il y en a."
              : "Change de filtre ci-dessus ou reviens plus tard — les nouvelles notifications apparaîtront ici automatiquement."
          }
          action={<Link href="/dashboard">Retour au dashboard</Link>}
        />
      ) : (
        <ul className="notifs-list">
          {filtered.map((n) => (
            <li key={n.id} className={`notifs-card ${n.read_at ? "" : "notifs-card--unread"}`}>
              <div className="notifs-card__head">
                <span className="notifs-card__type">{n.type}</span>
                <time className="notifs-card__time">{formatDate(n.created_at)}</time>
              </div>
              <h2 className="notifs-card__title">{n.title}</h2>
              {n.body && <p className="notifs-card__body">{n.body}</p>}
              <div className="notifs-card__actions">
                {n.link && (
                  <Link href={n.link} className="notifs-card__link" onClick={() => markAsRead(n.id)}>
                    Voir →
                  </Link>
                )}
                {!n.read_at && (
                  <button type="button" className="notifs-card__btn" onClick={() => markAsRead(n.id)}>
                    Marquer lu
                  </button>
                )}
                <button type="button" className="notifs-card__btn notifs-card__btn--danger" onClick={() => deleteOne(n.id)}>
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
