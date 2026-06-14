"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";

const PICK_TYPES = [
  { key: "momentum", icon: "🔥", label: "Momentum Pick", color: "#f97316", desc: "Le joueur avec le momentum le plus fort cette semaine." },
  { key: "sleeper",  icon: "⚡", label: "Sleeper Pick",  color: "#a78bfa", desc: "Fort potentiel, encore sous le radar — acheter avant la hype." },
  { key: "value",    icon: "💎", label: "Value Pick",    color: "#34d399", desc: "Meilleur rapport score/reconnaissance de marché." },
];

function fmt(n) {
  const x = Number(n);
  return Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : "—";
}

function PickCard({ pick, type }) {
  if (!pick) return null;
  return (
    <Reveal>
      <article className="pk-card" style={{ "--pk-color": type.color }}>
        <div className="pk-card__header">
          <span className="pk-card__icon" aria-hidden>{type.icon}</span>
          <span className="pk-card__type cn-mono">{type.label}</span>
        </div>
        <div className="pk-card__body">
          {pick.headshotUrl && (
            <img src={pick.headshotUrl} alt="" className="pk-card__img" loading="lazy" />
          )}
          <div className="pk-card__info">
            <h2 className="pk-card__name">{pick.playerName}</h2>
            <p className="pk-card__meta cn-mono">{pick.team ?? "—"} · Score {fmt(pick.score)}/10</p>
          </div>
        </div>
        {pick.reasoning && (
          <p className="pk-card__reason">{pick.reasoning.slice(0, 220)}{pick.reasoning.length > 220 ? "…" : ""}</p>
        )}
        <p className="pk-card__desc">{type.desc}</p>
        <Link href={`/deals?player=${encodeURIComponent(pick.playerName)}&signal=acheter`} className="pk-card__cta">
          Voir les deals
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </article>
    </Reveal>
  );
}

function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null); // null | "loading" | "ok" | "error"
  const [msg, setMsg] = useState("");
  const inputRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const val = email.trim();
    if (!val) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/picks/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: val }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur");
      setStatus("ok");
      setMsg("Abonné ! Tu recevras les picks chaque lundi.");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMsg(err.message);
    }
  }

  return (
    <form className="pk-subscribe" onSubmit={handleSubmit} aria-label="S'abonner aux picks hebdomadaires">
      <p className="pk-subscribe__label">Reçois les picks chaque lundi par email</p>
      <div className="pk-subscribe__row">
        <input
          ref={inputRef}
          type="email"
          className="pk-subscribe__input"
          placeholder="ton@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === "loading" || status === "ok"}
          aria-label="Adresse email"
        />
        <button
          type="submit"
          className="pk-subscribe__btn"
          disabled={status === "loading" || status === "ok"}
        >
          {status === "loading" ? "..." : status === "ok" ? "✓ Abonné" : "S'abonner"}
        </button>
      </div>
      {msg && (
        <p className={`pk-subscribe__msg${status === "error" ? " pk-subscribe__msg--error" : ""}`}>
          {msg}
        </p>
      )}
    </form>
  );
}

export default function PicksClient() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Handle unsubscribe via URL param
    const params = new URLSearchParams(window.location.search);
    const unsub = params.get("unsubscribe");
    if (unsub) {
      fetch(`/api/picks/subscribe?email=${encodeURIComponent(unsub)}`, { method: "DELETE" });
    }

    fetch("/api/picks")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="pk-page cinematic">
      <ScrollProgress />
      <Atmosphere />
      <div className="pk-rail"><AppNav active="picks" /></div>

      <main className="pk-main">
        <Reveal as="header" className="pk-hero">
          <p className="cn-eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            CARD SCOUT · PICKS · CHAQUE LUNDI
          </p>
          <h1 className="cn-h1">
            PICKS <span className="cn-h1__ice">HEBDO</span>
          </h1>
          <p className="pk-hero__sub">
            3 cartes à cibler cette semaine — Sleeper, Momentum, Value Pick.
          </p>
          {data?.weekLabel && (
            <p className="pk-hero__week cn-mono">Semaine du {data.weekLabel}</p>
          )}
        </Reveal>

        {loading && (
          <div className="pk-skels">
            {[...Array(3)].map((_, i) => <div key={i} className="pk-skel" />)}
          </div>
        )}

        {error && <p className="pk-error">Impossible de charger les picks : {error}</p>}

        {data && (
          <div className="pk-grid">
            {PICK_TYPES.map((type) => (
              <PickCard key={type.key} pick={data[type.key]} type={type} />
            ))}
          </div>
        )}

        <Reveal>
          <SubscribeForm />
        </Reveal>
      </main>
    </div>
  );
}
