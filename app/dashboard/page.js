import { redirect } from "next/navigation";

import AppNav from "../AppNav";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

import "../cinematic.css";
import "./dashboard.css";

export const metadata = {
  title: "Tableau de bord",
  description: "Vue d'ensemble de ton portfolio, suivis et opportunités personnalisées.",
};
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/dashboard");

  const [watchlistRes, portfolioRes, alertsRes] = await Promise.all([
    supabase.from("watchlist").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("portfolio_cards").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("price_alerts").select("*").eq("user_id", user.id).limit(20),
  ]);

  const watchlist = watchlistRes.data ?? [];
  const portfolio = portfolioRes.data ?? [];
  const alerts = alertsRes.data ?? [];

  const totalInvested = portfolio.reduce((s, c) => s + (Number(c.purchase_price_cad) || 0), 0);

  const emailHandle = (user.email ?? "scout").split("@")[0];
  const displayName = emailHandle.charAt(0).toUpperCase() + emailHandle.slice(1);

  return (
    <div className="cinematic dash-page">
      <div className="dash-rail">
        <AppNav active="/dashboard" />
      </div>
      <main className="dash-main">
        <DashboardClient
          displayName={displayName}
          email={user.email}
          watchlist={watchlist}
          portfolio={portfolio}
          alerts={alerts}
          totalInvested={totalInvested}
        />
      </main>
    </div>
  );
}
