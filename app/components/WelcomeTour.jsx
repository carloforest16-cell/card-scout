"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePreferences, useT } from "./PreferencesContext";

const STORAGE_KEY = "cs_visited";

// Suggestions pour l'étape "suis 3 joueurs" (tâche 6.4) — sous-ensemble
// diversifié (superstars + rookies chauds) de lib/trendingData.js. Dupliqué
// ici en dur plutôt qu'importé : trendingData.js est server-only, ce
// composant est client.
const ONBOARDING_PLAYER_SUGGESTIONS = [
  { id: "8478402", name: "Connor McDavid" },
  { id: "8478476", name: "Auston Matthews" },
  { id: "8480012", name: "Nathan MacKinnon" },
  { id: "8481540", name: "Cole Caufield" },
  { id: "8480762", name: "Connor Bedard" },
  { id: "8483515", name: "Macklin Celebrini" },
  { id: "8480768", name: "Quinn Hughes" },
  { id: "8479420", name: "Jack Hughes" },
];

const MAX_ONBOARDING_PICKS = 3;

export default function WelcomeTour() {
  const t = useT();
  const { prefsReady } = usePreferences();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState([]);
  const [following, setFollowing] = useState(false);
  const dialogRef = useRef(null);

  const STEPS = [
    { id: "welcome", title: t("tour.welcome.title"), body: t("tour.welcome.body"), cta: t("tour.next"), target: null },
    { id: "analyse",  title: t("tour.analyse.title"), body: t("tour.analyse.body"), cta: t("tour.next"), target: "[href='/analyse']" },
    { id: "deals",    title: t("tour.deals.title"),   body: t("tour.deals.body"),   cta: t("tour.next"),  target: "[href='/deals']" },
    { id: "players",  title: t("tour.players.title"), body: t("tour.players.body"), cta: t("tour.players.cta"), target: null },
  ];

  useEffect(() => {
    if (!prefsReady) return; // attendre que le modal prefs soit fermé
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch { return; }
    const timer = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(timer);
  }, [prefsReady]);

  const close = useCallback(() => {
    setOpen(false);
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* private mode */ }
  }, []);

  const togglePlayer = useCallback((player) => {
    setPicked((prev) => {
      const exists = prev.some((p) => p.id === player.id);
      if (exists) return prev.filter((p) => p.id !== player.id);
      if (prev.length >= MAX_ONBOARDING_PICKS) return prev;
      return [...prev, player];
    });
  }, []);

  // Suit les joueurs choisis (best-effort — échoue silencieusement si pas
  // connecté, l'utilisateur pourra toujours suivre des joueurs plus tard) et
  // mesure l'événement via /api/track (tâche 6.4 : path synthétique, la table
  // pageviews n'a pas de colonne "event" générique).
  const finishWithPlayers = useCallback(async () => {
    if (following) return;
    if (picked.length === 0) { close(); return; }
    setFollowing(true);
    const results = await Promise.allSettled(
      picked.map((p) =>
        fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId: p.id, playerName: p.name }),
        })
      )
    );
    const followedCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok
    ).length;
    if (followedCount > 0) {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "/_event/onboarding_players_followed",
          referrer: String(followedCount),
        }),
      }).catch(() => {});
    }
    setFollowing(false);
    close();
  }, [picked, following, close]);

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) {
      if (STEPS[step]?.id === "players") { finishWithPlayers(); return; }
      close();
      return;
    }
    setStep((s) => s + 1);
  }, [step, close, finishWithPlayers, STEPS]);

  // ESC fermeture + focus trap basique
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Tab") {
        // Trap focus dans le dialog
        const focusable = dialogRef.current?.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    // Auto-focus le bouton principal
    requestAnimationFrame(() => {
      const btn = dialogRef.current?.querySelector(".wt-next");
      btn?.focus();
    });
    return () => document.removeEventListener("keydown", onKey);
  }, [open, step, close]);

  if (!open) return null;

  const current = STEPS[step];

  return (
    <div
      className="wt-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wt-title"
      aria-describedby="wt-body"
    >
      <button
        type="button"
        className="wt-backdrop"
        onClick={close}
        aria-label="Fermer la visite guidée"
      />
      <div className="wt-card" ref={dialogRef}>
        <div className="wt-progress" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`wt-dot ${i === step ? "wt-dot--active" : ""} ${i < step ? "wt-dot--done" : ""}`} />
          ))}
        </div>
        <p className="wt-step" aria-live="polite">
          {t("tour.step")} {step + 1} {t("tour.of")} {STEPS.length}
        </p>
        <h2 id="wt-title" className="wt-title">{current.title}</h2>
        <p id="wt-body" className="wt-body">{current.body}</p>

        {current.id === "players" && (
          <div className="wt-players" role="group" aria-label={t("tour.players.title")}>
            {ONBOARDING_PLAYER_SUGGESTIONS.map((p) => {
              const active = picked.some((x) => x.id === p.id);
              const disabled = !active && picked.length >= MAX_ONBOARDING_PICKS;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`wt-player-chip${active ? " wt-player-chip--active" : ""}`}
                  onClick={() => togglePlayer(p)}
                  disabled={disabled}
                  aria-pressed={active}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="wt-actions">
          <button type="button" className="wt-skip" onClick={close}>
            {current.id === "players" ? t("tour.players.skip") : t("tour.skip")}
          </button>
          <button type="button" className="wt-next" onClick={next} disabled={following}>
            {following ? "…" : current.cta} {step < STEPS.length - 1 ? "→" : "✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
