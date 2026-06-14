"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { useToast } from "./Toast";

/**
 * @param {object} props
 * @param {string} props.playerId
 * @param {string} props.playerName
 * @param {string} [props.playerTeam]
 * @param {string} [props.playerPosition]
 * @param {string} [props.headshotUrl]
 */
export default function FollowButton({
  playerId,
  playerName,
  playerTeam,
  playerPosition,
  headshotUrl,
}) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setAuthed(Boolean(user));
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from("watchlist")
        .select("id")
        .eq("user_id", user.id)
        .eq("player_id", String(playerId))
        .maybeSingle();
      if (cancelled) return;
      setFollowing(Boolean(data));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [playerId]);

  async function toggle() {
    if (!authed) {
      router.push(`/auth/login?next=/player/${playerId}`);
      return;
    }
    setLoading(true);
    if (following) {
      const r = await fetch(`/api/watchlist?playerId=${encodeURIComponent(playerId)}`, { method: "DELETE" });
      if (r.ok) { setFollowing(false); toast(`${playerName} retiré de la watchlist`, "info"); }
      else toast("Erreur lors de la suppression", "error");
    } else {
      const r = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, playerName, playerTeam, playerPosition, headshotUrl }),
      });
      if (r.ok) { setFollowing(true); toast(`${playerName} ajouté à la watchlist`, "success"); }
      else toast("Erreur lors de l'ajout", "error");
    }
    setLoading(false);
  }

  return (
    <button
      type="button"
      className={`follow-btn${following ? " follow-btn--active" : ""}`}
      onClick={toggle}
      disabled={loading}
      aria-pressed={following}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={following ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
      </svg>
      <span>{following ? "Suivi" : "Suivre"}</span>
    </button>
  );
}
