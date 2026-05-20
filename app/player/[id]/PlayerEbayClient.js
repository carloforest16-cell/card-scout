"use client";

import { useEffect, useState } from "react";

/**
 * @param {{ playerId: string }} props
 */
export default function PlayerEbayClient({ playerId }) {
  const [res, setRes] = useState(
    /** @type {{ loading: boolean; mocked?: boolean; cards?: unknown[] }} */ {
      loading: true,
    }
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/cards?playerId=${encodeURIComponent(String(playerId))}`;
        const r = await fetch(url, { cache: "no-store" });
        const body = await r.json().catch(() => ({}));
        if (!cancelled) {
          setRes({
            loading: false,
            mocked: Boolean(body.mocked),
            cards: Array.isArray(body.cards) ? body.cards : [],
          });
        }
      } catch {
        if (!cancelled) {
          setRes({ loading: false, mocked: true, cards: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (res.loading) {
    return (
      <section
        className="player__section player__section--ebay"
        aria-labelledby="player-ebay-heading"
      >
        <div className="player__ebay-head">
          <h2 id="player-ebay-heading" className="player__section-title">
            Cartes sur eBay
          </h2>
        </div>
        <div className="player-ebay-skeleton" aria-busy="true">
          <ul className="player-ebay-skel-cards">
            {[1, 2, 3].map((k) => (
              <li key={k} className="player-ebay-skel-card">
                <div className="player-ebay-skel-card__media" />
                <div className="player-ebay-skel-card__body">
                  <div className="player-skel__line" />
                  <div className="player-skel__line player-skel__line--sm" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  const cardsMocked = Boolean(res.mocked);
  const ebayCards = Array.isArray(res.cards) ? res.cards : [];

  return (
    <section
      className="player__section player__section--ebay"
      aria-labelledby="player-ebay-heading"
    >
      <div className="player__ebay-head">
        <h2 id="player-ebay-heading" className="player__section-title">
          Cartes sur eBay
        </h2>
        {cardsMocked ? (
          <span className="player__ebay-badge">Démo</span>
        ) : null}
      </div>
      {cardsMocked ? (
        <p className="player__ebay-note">
          Aperçu fictif : branchement API réel avec{" "}
          <code className="player__ebay-code">EBAY_CLIENT_ID</code> et{" "}
          <code className="player__ebay-code">EBAY_CLIENT_SECRET</code> dans{" "}
          <code className="player__ebay-code">.env.local</code>.
        </p>
      ) : null}
      {ebayCards.length === 0 ? (
        <p className="player__ebay-empty">Aucune annonce pour le moment.</p>
      ) : (
        <ul className="player-cards">
          {ebayCards.map((card, index) => (
            <li key={`${card.title}-${index}`} className="player-card">
              <div className="player-card__media">
                {card.imageUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- URLs eBay dynamiques */}
                    <img
                      className="player-card__img"
                      src={card.imageUrl}
                      alt=""
                      loading="lazy"
                    />
                  </>
                ) : (
                  <div className="player-card__placeholder" aria-hidden="true" />
                )}
              </div>
              <div className="player-card__body">
                <h3 className="player-card__title">{card.title}</h3>
                <p className="player-card__price">{card.price}</p>
                {card.url ? (
                  <a
                    className="player-card__link"
                    href={card.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Voir sur eBay
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
