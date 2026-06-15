"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "cs_recent_players";
const MAX_PLAYERS = 5;

/**
 * @typedef {{ id: string; name: string; headshotUrl?: string | null; team?: string | null; viewedAt: number }} RecentPlayer
 */

function readStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeStorage(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* safari private mode */
  }
}

/**
 * Pousse un joueur dans la mémoire récente (max 5, dedup par id, MRU en tête).
 * @param {{ id: string | number; name: string; headshotUrl?: string | null; team?: string | null }} player
 */
export function pushRecentPlayer(player) {
  if (typeof window === "undefined") return;
  const id = String(player?.id ?? "").trim();
  const name = String(player?.name ?? "").trim();
  if (!id || !name) return;
  const current = readStorage();
  const filtered = current.filter((p) => String(p.id) !== id);
  const next = [
    {
      id,
      name,
      headshotUrl: player?.headshotUrl ?? null,
      team: player?.team ?? null,
      viewedAt: Date.now(),
    },
    ...filtered,
  ].slice(0, MAX_PLAYERS);
  writeStorage(next);
  // Notify other hooks/components mounted on this page
  window.dispatchEvent(new CustomEvent("cs:recent-players-updated"));
}

/**
 * Hook React — retourne la liste des joueurs récents (réactive aux pushs).
 * @returns {{ recent: RecentPlayer[]; clear: () => void }}
 */
export function useRecentPlayers() {
  const [recent, setRecent] = useState(/** @type {RecentPlayer[]} */ ([]));

  useEffect(() => {
    setRecent(readStorage());
    const handler = () => setRecent(readStorage());
    window.addEventListener("cs:recent-players-updated", handler);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) handler();
    });
    return () => {
      window.removeEventListener("cs:recent-players-updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(STORAGE_KEY);
    setRecent([]);
    window.dispatchEvent(new CustomEvent("cs:recent-players-updated"));
  }, []);

  return { recent, clear };
}
