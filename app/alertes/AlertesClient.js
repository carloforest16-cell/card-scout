/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import Reveal from "../components/Reveal";

const TABS = [
  { id: "active", label: "Actives" },
  { id: "triggered", label: "Déclenchées" },
  { id: "all", label: "Toutes" },
];

function watchlistAlertKinds(row) {
  const out = [];
  if (row.alert_new_listing) out.push({ key: "new_listing", label: "Nouvelle annonce", last: row.last_new_listing_at });
  if (row.alert_volume_spike) out.push({ key: "volume_spike", label: "Pic de volume", last: row.last_volume_spike_at });
  if (row.alert_gros_match) out.push({ key: "gros_match", label: "Gros match", last: row.last_gros_match_at });
  return out;
}

function unifyAlerts(priceAlerts, watchlistAlerts) {
  const price = priceAlerts.map((a) => ({
    id: `price-${a.id}`,
    realId: a.id,
    source: "price",
    playerId: a.player_id,
    playerName: a.player_name,
    active: a.active !== false,
    kindLabel: "Prix sous seuil",
    detail: `Sous $${Number(a.max_price_cad).toFixed(2)} CAD`,
    lastTriggeredAt: a.last_triggered_at,
    createdAt: a.created_at,
  }));

  const watch = [];
  watchlistAlerts.forEach((row) => {
    watchlistAlertKinds(row).forEach((k) => {
      watch.push({
        id: `watch-${row.id}-${k.key}`,
        realId: row.id,
        source: "watchlist",
        kindKey: k.key,
        playerId: row.player_id,
        playerName: row.player_name,
        headshotUrl: row.headshot_url,
        team: row.player_team,
        active: true,
        kindLabel: k.label,
        detail: row.player_team ?? "—",
        lastTriggeredAt: k.last,
        createdAt: row.created_at,
      });
    });
  });

  return [...price, ...watch].sort((a, b) => {
    const ad = new Date(a.lastTriggeredAt ?? a.createdAt).getTime();
    const bd = new Date(b.lastTriggeredAt ?? b.createdAt).getTime();
    return bd - ad;
  });
}

function formatDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
}

function IconBell() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function IconArrow({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function AlertCard({ alert, onToggle, onDelete, busy }) {
  return (
    <li className={`alerts-card ${alert.active ? "" : "alerts-card--off"}`}>
      <Link href={`/player/${alert.playerId}`} className="alerts-card__head">
        {alert.headshotUrl ? (
          <img src={alert.headshotUrl} alt="" className="alerts-card__avatar" />
        ) : (
          <span className="alerts-card__avatar alerts-card__avatar--ph" aria-hidden />
        )}
        <div className="alerts-card__name-block">
          <span className="alerts-card__name">{alert.playerName}</span>
          <span className="alerts-card__meta">{alert.detail}</span>
        </div>
      </Link>

      <div className="alerts-card__body">
        <div className="alerts-card__kind">
          <span className="alerts-card__kind-pill"><IconBell />{alert.kindLabel}</span>
          {alert.lastTriggeredAt ? (
            <span className="alerts-card__last">Dernier déclenchement · {formatDate(alert.lastTriggeredAt)}</span>
          ) : (
            <span className="alerts-card__last alerts-card__last--idle">Aucun déclenchement</span>
          )}
        </div>
      </div>

      <div className="alerts-card__actions">
        {alert.source === "price" && (
          <button
            type="button"
            className={`alerts-toggle ${alert.active ? "alerts-toggle--on" : "alerts-toggle--off"}`}
            onClick={() => onToggle(alert)}
            disabled={busy}
            aria-pressed={alert.active}
            aria-label={alert.active ? "Désactiver l'alerte" : "Réactiver l'alerte"}
          >
            <span className="alerts-toggle__knob" />
            <span className="alerts-toggle__label">{alert.active ? "Active" : "En pause"}</span>
          </button>
        )}
        {alert.source === "watchlist" && (
          <Link href="/watchlist" className="alerts-card__manage">
            Gérer dans la watchlist
            <IconArrow size={12} />
          </Link>
        )}
        {alert.source === "price" && (
          <button
            type="button"
            className="alerts-card__delete"
            onClick={() => onDelete(alert)}
            disabled={busy}
            aria-label="Supprimer l'alerte"
          >
            Supprimer
          </button>
        )}
      </div>
    </li>
  );
}

export default function AlertesClient({ priceAlerts: initialPrice, watchlistAlerts, triggered }) {
  const [priceAlerts, setPriceAlerts] = useState(initialPrice);
  const [tab, setTab] = useState("active");
  const [busy, setBusy] = useState(false);

  const unified = useMemo(() => unifyAlerts(priceAlerts, watchlistAlerts), [priceAlerts, watchlistAlerts]);
  const activeCount = unified.filter((a) => a.active).length;

  const filtered = useMemo(() => {
    if (tab === "active") return unified.filter((a) => a.active);
    if (tab === "triggered") return unified.filter((a) => a.lastTriggeredAt);
    return unified;
  }, [tab, unified]);

  async function handleToggle(alert) {
    if (alert.source !== "price") return;
    const next = !alert.active;
    setBusy(true);
    setPriceAlerts((xs) => xs.map((x) => (x.id === alert.realId ? { ...x, active: next } : x)));
    try {
      const r = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: alert.realId, active: next }),
      });
      if (!r.ok) throw new Error("toggle failed");
    } catch {
      setPriceAlerts((xs) => xs.map((x) => (x.id === alert.realId ? { ...x, active: !next } : x)));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(alert) {
    if (alert.source !== "price") return;
    setBusy(true);
    const snapshot = priceAlerts;
    setPriceAlerts((xs) => xs.filter((x) => x.id !== alert.realId));
    try {
      const r = await fetch(`/api/alerts?id=${encodeURIComponent(alert.realId)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
    } catch {
      setPriceAlerts(snapshot);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Reveal as="header" className="alerts-hero">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" />
          ALERTES PRIX & MARCHÉ
        </p>
        <h1 className="cn-h1 alerts-title">
          Mes alertes
          <span className="alerts-title__count">{activeCount}</span>
        </h1>
        <p className="alerts-sub">
          Suis les seuils de prix et les signaux marché. Tu reçois un email
          dès qu&apos;une condition est remplie.
        </p>
      </Reveal>

      <div className="alerts-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`alerts-tab ${tab === t.id ? "alerts-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="alerts-tab__badge">
              {t.id === "active" ? unified.filter((a) => a.active).length
                : t.id === "triggered" ? unified.filter((a) => a.lastTriggeredAt).length
                : unified.length}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="alerts-empty">
          <p className="alerts-empty__text">
            {tab === "active"
              ? "Aucune alerte active. Crée-en une depuis ta watchlist ou une page joueur."
              : tab === "triggered"
                ? "Aucun déclenchement enregistré pour l'instant."
                : "Tu n'as pas encore d'alerte. Configures-en pour ne rater aucune opportunité."}
          </p>
          <div className="alerts-empty__ctas">
            <Link href="/watchlist" className="alerts-empty__cta">Ma watchlist</Link>
            <Link href="/" className="alerts-empty__cta alerts-empty__cta--ghost">Explorer les joueurs</Link>
          </div>
        </div>
      ) : (
        <ul className="alerts-grid">
          {filtered.map((a) => (
            <AlertCard key={a.id} alert={a} onToggle={handleToggle} onDelete={handleDelete} busy={busy} />
          ))}
        </ul>
      )}

      {triggered.length > 0 && tab === "triggered" && (
        <Reveal>
          <section className="alerts-history">
            <h2 className="alerts-history__title">Journal des déclenchements</h2>
            <ul className="alerts-history__list">
              {triggered.map((t) => (
                <li key={t.id} className="alerts-history__row">
                  <span className="alerts-history__pill">{t.alert_kind}</span>
                  <span className="alerts-history__player">{t.player_name ?? "—"}</span>
                  <span className="alerts-history__time">{formatDate(t.triggered_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}
    </>
  );
}
