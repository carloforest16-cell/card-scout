"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Search, Trophy } from "lucide-react";

import EmptyState from "../components/EmptyState";

const SORTS = [
  { key: "score", label: "Score" },
  { key: "points", label: "Points" },
  { key: "ppg", label: "Pts / match" },
  { key: "draft", label: "Repêchage" },
  { key: "name", label: "Nom" },
];

const POSITIONS = [
  { key: "", label: "Tous" },
  { key: "F", label: "Attaquants" },
  { key: "D", label: "Défenseurs" },
];

const MIN_GAMES = [
  { key: 0, label: "Toutes" },
  { key: 20, label: "20 matchs +" },
  { key: 40, label: "40 matchs +" },
];

function tierClass(score) {
  if (score == null) return "rk-score--none";
  if (score >= 8) return "rk-score--elite";
  if (score >= 7) return "rk-score--strong";
  if (score >= 6) return "rk-score--solid";
  return "rk-score--watch";
}

function draftLabel(year, overall) {
  if (overall == null) return "Non repêché";
  return `${year ?? "—"} · #${overall}`;
}

function Headshot({ url, className }) {
  const [err, setErr] = useState(false);
  if (!url || err) {
    return (
      <div className={className} data-fallback="1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </div>
    );
  }
  return (
    <div className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- mugshots NHL tiers */}
      <img src={url} alt="" onError={() => setErr(true)} />
    </div>
  );
}

/** Le podium n'a de sens que sur un classement PAR SCORE — sinon il ment sur
 *  ce qu'il récompense. Masqué dès qu'un autre tri est actif. */
function Podium({ rookies }) {
  const top = rookies.slice(0, 3);
  if (top.length < 3) return null;
  // Ordre visuel : 2e, 1er, 3e — le 1er au centre et surélevé.
  const order = [top[1], top[0], top[2]];
  const ranks = [2, 1, 3];

  return (
    <div className="rk-podium" aria-label="Top 3 par Card Metrics Score">
      {order.map((r, i) => (
        <Link
          key={r.playerId}
          href={`/player/${r.playerId}`}
          prefetch={false}
          className={`rk-podium__slot rk-podium__slot--${ranks[i]}`}
        >
          <span className="rk-podium__rank cn-mono" aria-hidden>{ranks[i]}</span>
          <Headshot url={r.headshotUrl} className="rk-podium__face" />
          <span className="rk-podium__name">{r.fullName}</span>
          <span className="rk-podium__meta cn-mono">
            {[r.teamAbbrev, r.positionCode].filter(Boolean).join(" · ")}
          </span>
          <span className={`rk-podium__score cn-mono ${tierClass(r.score)}`}>
            {r.score != null ? Number(r.score).toFixed(1) : "—"}
          </span>
          <span className="rk-podium__stats cn-mono">
            {r.points ?? 0} pts · {r.gamesPlayed ?? 0} PJ
          </span>
        </Link>
      ))}
    </div>
  );
}

function RookieRow({ rookie, rank }) {
  const score = rookie.score;
  return (
    <Link
      href={`/player/${rookie.playerId}`}
      prefetch={false}
      className="rk-row"
    >
      <span className="rk-row__rank cn-mono" aria-hidden>{rank}</span>
      <Headshot url={rookie.headshotUrl} className="rk-row__face" />

      <span className="rk-row__id">
        <span className="rk-row__name">{rookie.fullName}</span>
        <span className="rk-row__meta cn-mono">
          {[
            rookie.teamAbbrev,
            rookie.positionCode,
            rookie.age != null ? `${rookie.age} ans` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>

      <span className="rk-row__stats cn-mono">
        <span className="rk-row__stat"><strong>{rookie.gamesPlayed ?? "—"}</strong> PJ</span>
        <span className="rk-row__stat"><strong>{rookie.points ?? "—"}</strong> Pts</span>
        <span className="rk-row__stat"><strong>{rookie.pointsPerGame ?? "—"}</strong> P/M</span>
      </span>

      <span className="rk-row__draft cn-mono">{draftLabel(rookie.draftYear, rookie.draftOverall)}</span>

      <span className="rk-row__scorebox">
        <span className={`rk-score cn-mono ${tierClass(score)}`}>
          {score != null ? Number(score).toFixed(1) : "—"}
        </span>
        {score == null ? (
          <span className="rk-row__scorenote">Non calculé</span>
        ) : rookie.scoreMode === "math" ? (
          <span className="rk-row__scorenote">Score de base · stats uniquement</span>
        ) : null}
      </span>
    </Link>
  );
}

export default function RecruesClient({ initial, initialFailed }) {
  const [data, setData] = useState(initial ?? null);
  const [failed, setFailed] = useState(Boolean(initialFailed));
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState("score");
  const [position, setPosition] = useState("");
  const [minGames, setMinGames] = useState(0);
  const [query, setQuery] = useState("");

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort });
      if (position) params.set("position", position);
      if (minGames > 0) params.set("minGames", String(minGames));
      const res = await fetch(`/api/recrues?${params.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Erreur");
      setData(json);
      setFailed(false);
    } catch (err) {
      console.error("[recrues] refetch failed:", err?.message ?? err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [sort, position, minGames]);

  // Le rendu serveur couvre déjà l'état par défaut — on ne refetch qu'après un
  // vrai changement de filtre.
  const isDefault = sort === "score" && position === "" && minGames === 0;
  useEffect(() => {
    if (isDefault && initial) return;
    refetch();
  }, [isDefault, initial, refetch]);

  const rookies = useMemo(() => {
    const list = data?.rookies ?? [];
    const q = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!q) return list;
    return list.filter((r) =>
      String(r.fullName ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .includes(q)
    );
  }, [data, query]);

  const showPodium = sort === "score" && !position && minGames === 0 && !query;

  if (failed && !data) {
    return (
      <div className="rk-body">
        <EmptyState
          icon={<AlertTriangle aria-hidden />}
          title="Classe de recrues indisponible"
          description="Les données de l'API NHL n'ont pas pu être chargées. Réessaie dans quelques minutes."
        />
      </div>
    );
  }

  return (
    <div className="rk-body">
      {data?.stale ? (
        <p className="rk-stale cn-mono">
          <AlertTriangle size={14} aria-hidden /> Liste datée — l&apos;API NHL n&apos;a pas répondu,
          ces données ne sont pas à jour.
        </p>
      ) : null}

      {showPodium ? <Podium rookies={data?.rookies ?? []} /> : null}

      <div className="rk-controls">
        <label className="rk-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher une recrue"
            aria-label="Chercher une recrue par nom"
          />
        </label>

        <div className="rk-chips" role="group" aria-label="Trier par">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`rk-chip ${sort === s.key ? "rk-chip--on" : ""}`}
              aria-pressed={sort === s.key}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="rk-chips" role="group" aria-label="Filtrer par position">
          {POSITIONS.map((p) => (
            <button
              key={p.key || "all"}
              type="button"
              className={`rk-chip ${position === p.key ? "rk-chip--on" : ""}`}
              aria-pressed={position === p.key}
              onClick={() => setPosition(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="rk-chips" role="group" aria-label="Filtrer par matchs joués">
          {MIN_GAMES.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`rk-chip ${minGames === g.key ? "rk-chip--on" : ""}`}
              aria-pressed={minGames === g.key}
              onClick={() => setMinGames(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <p className="rk-count cn-mono" aria-live="polite">
        {loading ? "Chargement…" : `${rookies.length} recrue${rookies.length > 1 ? "s" : ""}`}
      </p>

      {rookies.length === 0 && !loading ? (
        <EmptyState
          icon={<Trophy aria-hidden />}
          title="Aucune recrue ne correspond"
          description="Élargis les filtres ou efface la recherche pour revoir toute la cuvée."
        />
      ) : (
        <ol className="rk-list">
          {rookies.map((r, i) => (
            <li key={r.playerId}>
              <RookieRow rookie={r} rank={i + 1} />
            </li>
          ))}
        </ol>
      )}

      <p className="rk-note">
        « Recrue » = joueur dont la <strong>première saison NHL</strong> est la saison affichée
        (source : API NHL). Ce n&apos;est pas la définition officielle du trophée Calder, qui ajoute
        des conditions d&apos;âge et de matchs joués les saisons précédentes. Le Card Metrics Score
        n&apos;est calculé que pour une partie des joueurs — les autres apparaissent sans score
        plutôt qu&apos;avec un zéro trompeur.
      </p>
    </div>
  );
}
