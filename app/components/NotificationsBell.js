"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import "./notifications-bell.css";

const POLL_INTERVAL_MS = 60_000;

function timeAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

export default function NotificationsBell() {
  const [user, setUser] = useState(undefined);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications?limit=5");
      if (!r.ok) return;
      const data = await r.json();
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(Number(data.unreadCount ?? 0));
    } catch { /* */ }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user) fetchNotifs();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchNotifs();
      else { setItems([]); setUnread(0); }
    });
    return () => listener.subscription.unsubscribe();
  }, [fetchNotifs]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(fetchNotifs, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user, fetchNotifs]);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
      setUnread(0);
    } catch { /* */ }
  }

  if (!user) return null;

  return (
    <div className="cs-bell" ref={wrapRef}>
      <button
        type="button"
        className="cs-bell__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `${unread} notification${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="cs-bell__badge" aria-hidden>{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="cs-bell__menu" role="menu">
          <div className="cs-bell__head">
            <span className="cs-bell__title">Notifications</span>
            {unread > 0 && (
              <button type="button" className="cs-bell__action" onClick={markAllRead}>
                Tout marquer lu
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="cs-bell__empty">Aucune notification pour l&apos;instant.</p>
          ) : (
            <ul className="cs-bell__list">
              {items.map((n) => (
                <li key={n.id} className={`cs-bell__item ${n.read_at ? "" : "cs-bell__item--unread"}`}>
                  {n.link ? (
                    <Link href={n.link} className="cs-bell__item-link" onClick={() => setOpen(false)}>
                      <NotifBody notif={n} />
                    </Link>
                  ) : (
                    <div className="cs-bell__item-link">
                      <NotifBody notif={n} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link href="/notifications" className="cs-bell__see-all" onClick={() => setOpen(false)}>
            Voir toutes les notifications →
          </Link>
        </div>
      )}
    </div>
  );
}

function NotifBody({ notif }) {
  return (
    <>
      <div className="cs-bell__item-row">
        <span className="cs-bell__item-title">{notif.title}</span>
        <span className="cs-bell__item-time">{timeAgo(notif.created_at)}</span>
      </div>
      {notif.body && <p className="cs-bell__item-body">{notif.body}</p>}
    </>
  );
}
