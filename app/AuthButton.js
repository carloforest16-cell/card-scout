"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function AuthButton() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [open, setOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      if (data.user) fetchAlertCount();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchAlertCount();
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function fetchAlertCount() {
    try {
      const r = await fetch("/api/alerts");
      if (!r.ok) return;
      const data = await r.json();
      setAlertCount(Array.isArray(data.alerts) ? data.alerts.length : 0);
    } catch { /* */ }
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (user === undefined) return null; // évite le flash

  if (user) {
    const initial = (user.email ?? "?").charAt(0).toUpperCase();
    return (
      <div className="cs-profile" ref={wrapRef}>
        <button
          type="button"
          className={`cs-profile__trigger${open ? " cs-profile__trigger--open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Menu profil"
        >
          <span className="cs-profile__avatar" aria-hidden>{initial}</span>
          <span className="cs-profile__label">Profil</span>
          <svg className="cs-profile__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="cs-profile__menu" role="menu">
            <span className="cs-profile__email">{user.email}</span>
            <Link href="/dashboard" className="cs-profile__item" role="menuitem" onClick={() => setOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="7" height="9" rx="1.5" />
                <rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" />
                <rect x="3" y="16" width="7" height="5" rx="1.5" />
              </svg>
              Tableau de bord
            </Link>
            <Link href="/portfolio" className="cs-profile__item" role="menuitem" onClick={() => setOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2" y="3" width="6" height="18" rx="1"/><rect x="9" y="8" width="6" height="13" rx="1"/><rect x="16" y="13" width="6" height="8" rx="1"/>
              </svg>
              Mon Vault
            </Link>
            <Link href="/watchlist" className="cs-profile__item" role="menuitem" onClick={() => setOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
              </svg>
              Watchlist
            </Link>
            <Link href="/alertes" className="cs-profile__item" role="menuitem" onClick={() => setOpen(false)}>
              <span className="cs-profile__item-icon-wrap">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {alertCount > 0 && (
                  <span className="cs-profile__badge" aria-label={`${alertCount} alertes actives`}>
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                )}
              </span>
              Alertes
            </Link>
            <button type="button" className="cs-profile__item cs-profile__item--signout" role="menuitem" onClick={signOut}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
              Déconnexion
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Link href="/auth/login" className="cs-gbtn">
      <span className="cs-gbtn__glow">
        <span className="cs-gbtn__glow-inner" />
      </span>
      <span className="cs-gbtn__inner">Connexion</span>
      <span className="cs-gbtn__line" />
    </Link>
  );
}
