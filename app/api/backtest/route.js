import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyAdminToken } from "@/lib/adminAuth";
import { backtestWindow, computeBacktest, MIN_RELIABLE_SAMPLE } from "@/lib/backtest";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HORIZONS = [30, 60, 90];
const PAGE = 1000;

/**
 * Lit toutes les pages d'une requête Supabase (limite 1000 lignes/appel).
 * @param {(from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>} run
 */
async function readAll(run) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * GET /api/backtest?days=60
 *
 * Score de chaque joueur à T (= il y a `days` jours) vs variation du prix de
 * SES MÊMES cartes depuis (cohortes appariées, voir lib/backtest.js).
 *
 * Tant que le résultat n'est pas statistiquement fiable (échantillon trop
 * petit), le public ne reçoit que la taille d'échantillon + un message ;
 * seul un admin connecté (cookie `admin_session`) voit l'aperçu complet.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("days") || 60);
  const horizonDays = HORIZONS.includes(requested) ? requested : 60;

  const cookieStore = await cookies();
  const isAdmin = verifyAdminToken(cookieStore.get("admin_session")?.value);

  try {
    const db = getSupabaseAdmin();
    const win = backtestWindow(horizonDays);

    const [startPrices, recentPrices, scoreRows, players] = await Promise.all([
      readAll((a, b) =>
        db
          .from("card_price_history")
          .select("player_name, card_type, grade, snapshot_date, median_price_cad")
          .neq("card_type", "ALL")
          .gte("snapshot_date", win.startFrom)
          .lte("snapshot_date", win.startTo)
          .order("id")
          .range(a, b)
      ),
      readAll((a, b) =>
        db
          .from("card_price_history")
          .select("player_name, card_type, grade, snapshot_date, median_price_cad")
          .neq("card_type", "ALL")
          .gte("snapshot_date", win.recentFrom)
          .order("id")
          .range(a, b)
      ),
      readAll((a, b) =>
        db
          .from("player_scores_history")
          .select("player_id, score, snapshot_date")
          .gte("snapshot_date", win.scoreFrom)
          .lte("snapshot_date", win.scoreTo)
          .order("id")
          .range(a, b)
      ),
      readAll((a, b) =>
        db
          .from("player_scores")
          .select("player_id, player_name, team, headshot_url")
          .order("player_id")
          .range(a, b)
      ),
    ]);

    const result = computeBacktest({
      priceRows: [...startPrices, ...recentPrices],
      scoreRows,
      players,
      horizonDays,
    });

    if (!result.reliable && !isAdmin) {
      return NextResponse.json({
        ok: true,
        reliable: false,
        horizonDays,
        sampleSize: result.sampleSize,
        minSample: MIN_RELIABLE_SAMPLE,
        message:
          result.sampleSize === 0
            ? "Collecte de données en cours — pas encore assez d'historique de prix sur cette fenêtre."
            : `Échantillon encore trop petit (${result.sampleSize} joueurs sur ${MIN_RELIABLE_SAMPLE} requis) pour tirer une conclusion honnête.`,
      });
    }

    return NextResponse.json({
      ok: true,
      preview: !result.reliable,
      priceSource: "active_listings",
      minSample: MIN_RELIABLE_SAMPLE,
      ...result,
    });
  } catch (err) {
    console.error("[api/backtest] échec du calcul:", err?.message ?? err);
    return NextResponse.json({ ok: false, error: "Backtest indisponible" }, { status: 500 });
  }
}
