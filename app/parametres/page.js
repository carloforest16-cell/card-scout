import { redirect } from "next/navigation";

import AppNav from "../AppNav";
import { createClient } from "@/lib/supabase/server";

import "../cinematic.css";
import "./parametres.css";

import ParametresClient from "./ParametresClient";

export const metadata = { title: "Paramètres | Card Scout" };
export const dynamic = "force-dynamic";

const DEFAULTS = {
  currency: "CAD",
  marketplace: "EBAY_CA",
  theme: "auto",
  language: "fr",
  notify_price_alerts: true,
  notify_weekly_digest: true,
  notify_opps: true,
};

export default async function ParametresPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/parametres");

  const { data: prefRow } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .maybeSingle();

  const preferences = { ...DEFAULTS, ...(prefRow?.preferences ?? {}) };

  return (
    <div className="cinematic prefs-page">
      <div className="prefs-rail">
        <AppNav active={null} />
      </div>
      <main className="prefs-main">
        <ParametresClient
          email={user.email}
          createdAt={user.created_at}
          initialPreferences={preferences}
        />
      </main>
    </div>
  );
}
