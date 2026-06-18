import { redirect } from "next/navigation";

import AppNav from "../AppNav";
import { createClient } from "@/lib/supabase/server";

import "../cinematic.css";
import "./notifications.css";

import NotificationsClient from "./NotificationsClient";

export const metadata = { title: "Notifications | Card Scout" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/notifications");

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="cinematic notifs-page">
      <div className="notifs-rail">
        <AppNav active={null} />
      </div>
      <main className="notifs-main">
        <NotificationsClient initialItems={data ?? []} />
      </main>
    </div>
  );
}
