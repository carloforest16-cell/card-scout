import "./recrues.css";

import AppNav from "../AppNav";
import RecruesClient from "./RecruesClient";
import { getRookieClass } from "@/lib/rookieClass";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Classe de recrues NHL",
  description:
    "Toutes les premières saisons NHL de l'année, classées par Card Metrics Score — stats, rang de repêchage et cartes à suivre.",
  openGraph: {
    title: "Classe de recrues NHL — Card Metrics",
    description:
      "Toutes les premières saisons NHL de l'année, classées par Card Metrics Score.",
  },
};

/** 20252026 → « 2025-26 » */
function seasonLabel(seasonId) {
  const s = String(seasonId ?? "");
  if (s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
}

export default async function RecruesPage() {
  let initial = null;
  let failed = false;
  try {
    initial = await getRookieClass();
  } catch (err) {
    console.error("[recrues] chargement initial échoué:", err?.message ?? err);
    failed = true;
  }

  const label = seasonLabel(initial?.seasonId) ?? null;

  return (
    <div className="rk-page">
      <AppNav />

      <header className="rk-hero">
        <span className="rk-hero__eyebrow cn-eyebrow">
          Classe de recrues{label ? ` · NHL ${label}` : ""}
        </span>
        <h1 className="rk-hero__title cn-h1">
          {label ? `La cuvée ${label}` : "La cuvée de recrues"}
        </h1>
        <p className="rk-hero__sub">
          {initial
            ? `${initial.total} premières saisons NHL · ${initial.scored} notées par Card Metrics`
            : "Les premières saisons NHL de l'année, classées par Card Metrics Score."}
        </p>
      </header>

      <RecruesClient initial={initial} initialFailed={failed} />
    </div>
  );
}
