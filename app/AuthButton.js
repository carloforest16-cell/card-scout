"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function AuthButton() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (user === undefined) return null; // évite le flash

  if (user) {
    return (
      <>
        <Link href="/watchlist" className="cs-nav__btn">
          Watchlist
        </Link>
        <Link href="/alertes" className="cs-nav__btn">
          Alertes
        </Link>
        <button type="button" className="cs-nav__btn" onClick={signOut}>
          Déconnexion
        </button>
      </>
    );
  }

  return (
    <Link href="/auth/login" className="cs-nav__btn cs-nav__btn--cta">
      Connexion
    </Link>
  );
}
