"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePreferences, useT } from "./PreferencesContext";

const STORAGE_KEY = "cs_visited";

export default function WelcomeTour() {
  const t = useT();
  const { prefsReady } = usePreferences();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const dialogRef = useRef(null);

  const STEPS = [
    { id: "welcome", title: t("tour.welcome.title"), body: t("tour.welcome.body"), cta: t("tour.next"), target: null },
    { id: "analyse",  title: t("tour.analyse.title"), body: t("tour.analyse.body"), cta: t("tour.next"), target: "[href='/analyse']" },
    { id: "deals",    title: t("tour.deals.title"),   body: t("tour.deals.body"),   cta: t("tour.done"),  target: "[href='/deals']" },
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

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) { close(); return; }
    setStep((s) => s + 1);
  }, [step, close]);

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
        <div className="wt-actions">
          <button type="button" className="wt-skip" onClick={close}>
            {t("tour.skip")}
          </button>
          <button type="button" className="wt-next" onClick={next}>
            {current.cta} {step < STEPS.length - 1 ? "→" : "✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
