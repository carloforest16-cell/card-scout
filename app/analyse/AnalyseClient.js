"use client";

/* eslint-disable @next/next/no-img-element -- images eBay dynamiques */
import { useState } from "react";

import AppNav from "../AppNav";

function formatCad(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(x);
}

function formatScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return (Math.round(x * 10) / 10).toFixed(1);
}

function verdictTone(verdict) {
  const v = String(verdict ?? "").toLowerCase();
  if (v.includes("acheter")) return "buy";
  if (v.includes("passer") || v.includes("éviter") || v.includes("eviter"))
    return "avoid";
  return "watch";
}

export default function AnalyseClient() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState({ loading: false, data: null, error: null });

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setState({ loading: true, data: null, error: null });
    try {
      const r = await fetch("/api/analyze-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const body = await r.json().catch(() => null);
      if (!body?.ok) {
        setState({
          loading: false,
          data: null,
          error: body?.error ?? "Analyse impossible.",
        });
        return;
      }
      setState({ loading: false, data: body, error: null });
    } catch {
      setState({ loading: false, data: null, error: "Erreur réseau." });
    }
  }

  const d = state.data;
  const tone = d?.verdict ? verdictTone(d.verdict.verdict) : "watch";

  return (
    <div className="op-page">
      <div className="op-shell">
        <div className="cs-nav-wrap">
          <AppNav active="analyse" />
        </div>

        <header className="op-hero">
          <p className="op-hero__badge">
            <span aria-hidden>●</span> IA · Analyse d&apos;annonce
          </p>
          <h1 className="op-hero__title">Analyser une annonce eBay</h1>
          <p className="op-hero__subtitle">
            Colle le lien d&apos;une annonce eBay. L&apos;IA évalue le joueur, le
            type de carte, si le prix est juste vs la cote du marché, et repère
            les alternatives moins chères.
          </p>
        </header>

        <form className="an-search" onSubmit={handleSubmit}>
          <input
            type="url"
            inputMode="url"
            className="an-search__input"
            placeholder="https://www.ebay.ca/itm/123456789012"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="URL de l'annonce eBay"
          />
          <button
            type="submit"
            className="an-search__btn"
            disabled={state.loading || !url.trim()}
          >
            {state.loading ? "Analyse…" : "Analyser"}
          </button>
        </form>

        {state.error ? (
          <p className="an-error" role="alert">
            {state.error}
          </p>
        ) : null}

        {state.loading ? (
          <div className="an-skeleton" aria-busy="true">
            <div className="an-skeleton__line an-skeleton__line--lg" />
            <div className="an-skeleton__line" />
            <div className="an-skeleton__line an-skeleton__line--sm" />
          </div>
        ) : null}

        {d ? (
          <div className="an-result">
            {/* Verdict global */}
            {d.verdict ? (
              <section className={`an-verdict an-verdict--${tone}`}>
                <span className="an-verdict__label">{d.verdict.verdict}</span>
                <p className="an-verdict__summary">{d.verdict.summary}</p>
              </section>
            ) : null}

            {/* Annonce */}
            <section className="an-card">
              <div className="an-card__media">
                {d.listing.imageUrl ? (
                  <img src={d.listing.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className="an-card__ph" aria-hidden>
                    ◆
                  </span>
                )}
              </div>
              <div className="an-card__body">
                <h2 className="an-card__title">{d.listing.title}</h2>
                <p className="an-card__price">
                  {formatCad(d.listing.priceCad)}
                  <span className="an-card__ship">
                    {d.listing.shippingCad > 0
                      ? ` (dont ${formatCad(d.listing.shippingCad)} port)`
                      : " · port inclus / gratuit"}
                  </span>
                </p>
                <div className="an-card__tags">
                  {d.player ? (
                    <span className="an-tag">{d.player.name}</span>
                  ) : (
                    <span className="an-tag an-tag--warn">Joueur non identifié</span>
                  )}
                  {d.card?.group ? <span className="an-tag">{d.card.group}</span> : null}
                  {d.card?.grade ? <span className="an-tag">{d.card.grade}</span> : null}
                  {d.card?.year ? <span className="an-tag">{d.card.year}</span> : null}
                </div>
                {d.listing.url ? (
                  <a
                    className="an-card__link"
                    href={d.listing.url}
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                  >
                    Voir l&apos;annonce sur eBay →
                  </a>
                ) : null}
              </div>
            </section>

            {/* Détails: joueur + prix */}
            <div className="an-grid">
              {/* Joueur */}
              <section className="an-panel">
                <h3 className="an-panel__title">Le joueur</h3>
                {d.cardScout ? (
                  <>
                    <p className="an-panel__big">
                      <span className="an-panel__score">
                        {formatScore(d.cardScout.score)}
                      </span>
                      <span className="an-panel__max">/10 · Card Scout Score</span>
                    </p>
                    {d.cardScout.verdict ? (
                      <p
                        className={`an-mini-verdict an-mini-verdict--${verdictTone(
                          d.cardScout.verdict
                        )}`}
                      >
                        {d.cardScout.verdict}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="an-panel__muted">
                    Score joueur indisponible (joueur non identifié dans le titre).
                  </p>
                )}
                {d.verdict?.playerVerdict ? (
                  <p className="an-panel__note">{d.verdict.playerVerdict}</p>
                ) : null}
              </section>

              {/* Prix vs juste-valeur */}
              <section className="an-panel">
                <h3 className="an-panel__title">Le prix</h3>
                {d.fairValue ? (
                  <>
                    <p className="an-panel__big">
                      <span className="an-panel__score">
                        {formatCad(d.fairValue.fairValueCad)}
                      </span>
                      <span className="an-panel__max">juste-valeur du marché</span>
                    </p>
                    {d.fairValue.trusted ? (
                      <p
                        className={`an-delta ${
                          d.fairValue.deltaPct <= 0
                            ? "an-delta--good"
                            : "an-delta--bad"
                        }`}
                      >
                        {d.fairValue.deltaPct <= 0 ? "" : "+"}
                        {d.fairValue.deltaPct}% vs la cote · {d.fairValue.comps} comps
                      </p>
                    ) : (
                      <p className="an-panel__muted">
                        Estimation indicative ({d.fairValue.comps} comparables) —
                        pas assez de données pour un verdict de prix ferme.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="an-panel__muted">
                    Pas assez d&apos;annonces comparables pour estimer la cote de
                    cette carte précise.
                  </p>
                )}
                {d.verdict?.priceVerdict ? (
                  <p className="an-panel__note">{d.verdict.priceVerdict}</p>
                ) : null}
              </section>
            </div>

            {/* Type de carte */}
            {d.verdict?.cardVerdict ? (
              <section className="an-panel">
                <h3 className="an-panel__title">Le type de carte</h3>
                <p className="an-panel__note">{d.verdict.cardVerdict}</p>
              </section>
            ) : null}

            {/* Alternatives moins chères */}
            <section className="an-panel">
              <h3 className="an-panel__title">
                Alternatives moins chères ({d.alternatives.length})
              </h3>
              {d.alternatives.length === 0 ? (
                <p className="an-panel__muted">
                  Aucune annonce identique trouvée moins chère — c&apos;est plutôt
                  bon signe pour ce prix.
                </p>
              ) : (
                <ul className="an-alts">
                  {d.alternatives.map((a, i) => (
                    <li key={`${a.url}-${i}`} className="an-alt">
                      <span className="an-alt__price">{formatCad(a.priceCad)}</span>
                      <span className="an-alt__title">{a.title}</span>
                      {a.url ? (
                        <a
                          className="an-alt__link"
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                        >
                          Voir →
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
