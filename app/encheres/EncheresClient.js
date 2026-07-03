"use client";

/* eslint-disable @next/next/no-img-element -- photos eBay dynamiques */
import { useEffect, useMemo, useState } from "react";

import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import PriceProvenance from "../components/PriceProvenance";
import Reveal from "../components/Reveal";
import ScrollProgress from "../components/ScrollProgress";

function formatCad(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(x);
}

function truncate(s, max = 70) {
  const t = String(s ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Calcule le temps restant en h/m/s à partir d'un timestamp ISO. */
function formatTimeLeft(endIso, nowMs) {
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(endMs)) return { label: "—", urgent: false, expired: true };
  const ms = endMs - nowMs;
  if (ms <= 0) return { label: "Terminé", urgent: false, expired: true };
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (hours >= 1) return { label: `${hours}h ${String(minutes).padStart(2, "0")}min`, urgent: hours < 3, expired: false };
  if (minutes >= 1) return { label: `${minutes}min ${String(seconds).padStart(2, "0")}s`, urgent: true, expired: false };
  return { label: `${seconds}s`, urgent: true, expired: false };
}

function AuctionCard({ auction, nowMs }) {
  const time = formatTimeLeft(auction.endAt, nowMs);
  if (time.expired) return null;
  return (
    <a
      className={`enc-card ${time.urgent ? "enc-card--urgent" : ""}`}
      href={auction.url ?? "#"}
      target="_blank"
      rel="noopener noreferrer sponsored"
    >
      <div className="enc-card__media">
        {auction.imageUrl ? (
          <img src={auction.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="enc-card__ph" aria-hidden>◆</span>
        )}
        <span className={`enc-card__timer ${time.urgent ? "enc-card__timer--urgent" : ""}`}>
          <span className="enc-card__timer-dot" aria-hidden />
          {time.label}
        </span>
        <span className="enc-card__deal-badge">−{auction.dealPct}%</span>
        {auction.auctionScore != null && (
          <span
            className={`enc-card__score ${auction.auctionScore >= 7 ? "enc-card__score--high" : auction.auctionScore >= 5 ? "enc-card__score--mid" : "enc-card__score--low"}`}
            title="Score Enchère Card Metrics (urgence × rabais × qualité carte)"
          >
            {auction.auctionScore.toFixed(1)}
          </span>
        )}
      </div>
      <div className="enc-card__body">
        <p className="enc-card__player">{auction.playerName}</p>
        <p className="enc-card__title">{truncate(auction.title)}</p>
        <p className="enc-card__type cn-mono">{auction.cardType}</p>
        <div className="enc-card__prices">
          <div className="enc-card__price-block">
            <span className="enc-card__label">Bid actuel</span>
            <span className="enc-card__bid cn-mono">{formatCad(auction.priceCad)}</span>
          </div>
          <div className="enc-card__price-block enc-card__price-block--fair">
            <span className="enc-card__label">Cote</span>
            <span className="enc-card__fair cn-mono">{formatCad(auction.fairValueCad)}</span>
          </div>
        </div>
        <div className="enc-card__footer">
          <span className="enc-card__bids cn-mono">
            {auction.bidCount === 0 ? "Aucune offre" : `${auction.bidCount} offre${auction.bidCount > 1 ? "s" : ""}`}
          </span>
          <span className="enc-card__comps cn-mono">
            {auction.fairValueComps} comps
          </span>
        </div>
        <PriceProvenance meta={auction.marketValueMeta} className="enc-card__provenance" />
      </div>
    </a>
  );
}

export default function EncheresClient() {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auctions/ending-soon")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setState({ loading: false, data: d, error: null }); })
      .catch((e) => { if (!cancelled) setState({ loading: false, data: null, error: String(e?.message ?? e) }); });
    return () => { cancelled = true; };
  }, []);

  const auctions = useMemo(() => {
    const list = Array.isArray(state.data?.auctions) ? state.data.auctions : [];
    return list.filter((a) => Date.parse(a.endAt) > nowMs);
  }, [state.data, nowMs]);

  return (
    <div className="enc-page cinematic">
      <ScrollProgress />
      <Atmosphere />

      <div className="enc-rail">
        <div className="enc-rail__inner">
          <AppNav active="encheres" />
        </div>
      </div>

      <main className="enc-main">
        <Reveal as="header" className="enc-hero">
          <p className="cn-eyebrow enc-hero__eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            ENCHÈRES · MOINS DE 24H · SOUS LA COTE
          </p>
          <h1 className="cn-h1 enc-hero__title">
            ENCHÈRES <span className="cn-h1__ice">CHAUDES</span>
          </h1>
          <p className="cn-body enc-hero__sub">
            Enchères eBay qui finissent dans moins de 24 h, où le bid actuel est <strong>sous la cote</strong> du marché Card Metrics.
            Plus l&apos;enchère approche de la fin, plus la fenêtre se referme.
          </p>
          <div className="enc-hero__meta">
            <span className="cn-label">Mis à jour</span>
            <span className="cn-mono">
              {state.data?.generatedAt
                ? new Date(state.data.generatedAt).toLocaleString("fr-CA", { hour: "2-digit", minute: "2-digit" })
                : "—"}
            </span>
            <span className="enc-hero__sep" aria-hidden>·</span>
            <span className="cn-label">Enchères actives</span>
            <span className="cn-mono">{auctions.length}</span>
          </div>
        </Reveal>

        {state.loading ? (
          <div className="enc-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="enc-card enc-card--skel">
                <div className="enc-card__skel-media" />
                <div className="enc-card__skel-body">
                  <div className="enc-card__skel-line" />
                  <div className="enc-card__skel-line enc-card__skel-line--short" />
                </div>
              </div>
            ))}
          </div>
        ) : state.error ? (
          <p className="enc-empty">Erreur de chargement : {state.error}</p>
        ) : auctions.length === 0 ? (
          <div className="enc-empty">
            <p className="enc-empty__title">Aucune enchère chaude pour l&apos;instant</p>
            <p className="enc-empty__sub">
              Reviens plus tard — les enchères qui finissent dans 24 h apparaîtront ici dès qu&apos;une cohorte solide se forme.
            </p>
          </div>
        ) : (
          <div className="enc-grid">
            {auctions.map((a) => (
              <AuctionCard key={a.itemId ?? a.url} auction={a} nowMs={nowMs} />
            ))}
          </div>
        )}

        <p className="enc-source cn-mono">
          Cote basée sur annonces actives (prix demandés). Pas une garantie — bid avec ton propre jugement.
        </p>
      </main>
    </div>
  );
}
