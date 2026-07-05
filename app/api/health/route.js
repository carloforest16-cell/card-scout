import { NextResponse } from "next/server";

import { buildHealthReport } from "@/lib/healthReport";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Protégé par Bearer ${CRON_SECRET}. Agrège la fraîcheur des caches clés et
 * le dernier run de chaque cron pour un verdict global ok | warn | error.
 * Ne contient aucune donnée sensible — sûr à appeler depuis un monitoring
 * externe ou le cron sentinelle (/api/cron/health-check).
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const report = await buildHealthReport();
  if (!report.ok) {
    return NextResponse.json(report, { status: 502 });
  }

  return NextResponse.json(report);
}
