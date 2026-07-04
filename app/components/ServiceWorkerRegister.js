"use client";

import { useEffect } from "react";

/** Enregistre le service worker minimal (tâche 6.1 du plan). Silencieux en cas d'échec. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
