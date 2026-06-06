import Link from "next/link";
import { redirect } from "next/navigation";

import AppNav from "../AppNav";
import { createClient } from "@/lib/supabase/server";

import "../cinematic.css";
import "../watchlist/watchlist.css";

import { AlertsList } from "./AlertsList";

export const metadata = { title: "Mes alertes | Card Scout" };
export const dynamic = "force-dynamic";

export default async function AlertesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/alertes");

  const { data: items } = await supabase
    .from("price_alerts")
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
            <span className="cn-eyebrow__dot" aria-hidden /> ALERTES PRIX
          </p>
          <h1 className="cn-h1 wl-title">Mes alertes</h1>
          <p className="wl-subtitle">
            {items?.length ?? 0} alerte{(items?.length ?? 0) > 1 ? "s" : ""} active{(items?.length ?? 0) > 1 ? "s" : ""}. On t&apos;envoie un email dès qu&apos;une carte passe sous ton prix.
          </p>
        </header>

        {!items || items.length === 0 ? (
          <div className="wl-empty">
            <p className="wl-empty__text">
              Aucune alerte. Ouvre une page joueur et clique sur <strong>Créer une alerte</strong>.
            </p>
            <Link href="/" className="wl-empty__cta">Explorer les joueurs</Link>
          </div>
        ) : (
          <AlertsList items={items} />
        )}
      </main>
    </div>
  );
}
