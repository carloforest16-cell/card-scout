import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authError = checkAdminAuth(request);
  if (authError) return authError;

  // Pas de source analytics configurée — retourner placeholder propre
  return NextResponse.json({
    ok: true,
    available: false,
    note: "Analytics non configuré. Intégrez @vercel/analytics ou une source custom pour activer cette section.",
    placeholder: {
      pageViews: null,
      uniqueVisitors: null,
      topPages: [],
      conversionRate: null,
    },
  });
}
