import Link from "next/link";
import { redirect } from "next/navigation";

import AppNav from "../AppNav";
import { createClient } from "@/lib/supabase/server";

import "../cinematic.css";
import "./watchlist.css";

export const metadata = { title: "Ma watchlist | Card Scout" };
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/watchlist");

  const { data: items } = await supabase
    .from("watchlist")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="cinematic wl-page">
      <div className="wl-rail">
        <AppNav active={null} />
      </div>
      <main className="wl-main">
        <header className="wl-header">
          <p className="cn-eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden /> WATCHLIST
          </p>
          <h1 className="cn-h1 wl-title">Joueurs suivis</h1>
          <p className="wl-subtitle">
            {items?.length ?? 0} joueur{(items?.length ?? 0) > 1 ? "s" : ""} dans ta liste.
          </p>
        </header>

        {!items || items.length === 0 ? (
          <div className="wl-empty">
            <p className="wl-empty__text">
              Aucun joueur suivi pour l&apos;instant. Ouvre une page joueur et clique sur <strong>Suivre</strong> pour l&apos;ajouter ici.
            </p>
            <Link href="/" className="wl-empty__cta">Explorer les joueurs</Link>
          </div>
        ) : (
          <ul className="wl-grid">
            {items.map((p) => (
              <li key={p.id} className="wl-card">
                <Link href={`/player/${p.player_id}`} className="wl-card__link">
                  {p.headshot_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.headshot_url} alt="" className="wl-card__img" />
                  ) : (
                    <div className="wl-card__img wl-card__img--ph" aria-hidden />
                  )}
                  <div className="wl-card__info">
                    <span className="wl-card__name">{p.player_name}</span>
                    <span className="wl-card__meta">
                      {p.player_team ?? "—"} · {p.player_position ?? "—"}
                    </span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
