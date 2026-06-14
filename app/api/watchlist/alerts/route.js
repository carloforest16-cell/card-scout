import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["alert_new_listing", "alert_volume_spike", "alert_gros_match"];

export async function PATCH(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { watchlistId, alertType, enabled } = body ?? {};

  if (!watchlistId || !VALID_TYPES.includes(alertType) || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("watchlist")
    .update({ [alertType]: enabled })
    .eq("id", watchlistId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
