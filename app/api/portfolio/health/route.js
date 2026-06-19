import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { computePortfolioHealthScore } from "@/lib/portfolioValue";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await computePortfolioHealthScore(user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}
