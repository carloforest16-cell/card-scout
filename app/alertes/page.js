import { redirect } from "next/navigation";

import AppNav from "../AppNav";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

import "../cinematic.css";
import "./alertes.css";

import AlertesClient from "./AlertesClient";

export const metadata = { title: "Mes alertes | Card Metrics" };
export const dynamic = "force-dynamic";

export default async function AlertesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/alertes");

  const admin = getSupabaseAdmin();
  const [priceRes, watchRes, triggeredRes] = await Promise.all([
    supabase
      .from("price_alerts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("watchlist")
      .select("*")
      .eq("user_id", user.id)
      .or("alert_new_listing.eq.true,alert_volume_spike.eq.true,alert_gros_match.eq.true"),
    admin
      .from("alerts_triggered")
      .select("*")
      .eq("user_id", user.id)
      .order("triggered_at", { ascending: false })
      .limit(50),
  ]);

  const priceAlerts = priceRes.data ?? [];
  const watchlistAlerts = watchRes.data ?? [];
  const triggered = triggeredRes.data ?? [];

  return (
    <div className="cinematic alerts-page">
      <div className="alerts-rail">
        <AppNav active={null} />
      </div>
      <main className="alerts-main">
        <AlertesClient
          priceAlerts={priceAlerts}
          watchlistAlerts={watchlistAlerts}
          triggered={triggered}
        />
      </main>
    </div>
  );
}
