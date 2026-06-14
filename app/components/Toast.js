"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import "./toast.css";

/* ─── Context ────────────────────────────────────────────────────────────── */

const ToastContext = createContext(null);

/* ─── Icons ──────────────────────────────────────────────────────────────── */

function IconSuccess() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="toast__icon" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
function IconError() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="toast__icon" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="toast__icon" aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

const ICONS = { success: IconSuccess, error: IconError, info: IconInfo };

/* ─── Single toast ───────────────────────────────────────────────────────── */

function ToastItem({ id, type = "info", message, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(id), 280);
  }, [id, onDismiss]);

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, 3500);
    return () => clearTimeout(timerRef.current);
  }, [dismiss]);

  const Icon = ICONS[type] ?? IconInfo;

  return (
    <div
      className={`toast toast--${type}${exiting ? " toast--out" : ""}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="toast__icon-wrap"><Icon /></span>
      <span className="toast__msg">{message}</span>
      <button
        type="button"
        className="toast__close"
        onClick={dismiss}
        aria-label="Fermer la notification"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/* ─── Provider ───────────────────────────────────────────────────────────── */

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const addToast = useCallback((message, type = "info") => {
    const id = ++counterRef.current;
    setToasts((prev) => {
      const next = [...prev, { id, type, message }];
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Expose on window for debugging
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__toast = addToast;
    }
  }, [addToast]);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container" aria-label="Notifications" role="region">
        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ─── Hook ───────────────────────────────────────────────────────────────── */

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return () => {};
  return ctx;
}
