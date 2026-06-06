"use client";

/* eslint-disable @next/next/no-img-element -- URLs eBay dynamiques */
import { useEffect, useState } from "react";

import Reveal from "../../components/Reveal";
import TiltCard from "../../components/TiltCard";

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

  return (
    <section className="pl-section" aria-labelledby="pl-ebay-heading">
      <div className="pl-section__head">
        <p className="cn-eyebrow">
          <span className="cn-eyebrow__dot" aria-hidden />
          MARCHÉ · EBAY
          {res.mocked ? " · DÉMO" : ""}
        </p>
        <h2 id="pl-ebay-heading" className="cn-h2">
          CARTES SUR EBAY
        </h2>
      </div>

      {res.loading ? (
        <div className="pl-deals" aria-busy="true">
          {[1, 2, 3].map((k) => (
            <div key={k} className="pl-deal-skel" />
          ))}
        </div>
      ) : res.cards?.length ? (
        <div className="pl-deals">
          {res.cards.map((card, index) => (
            <Reveal key={`${card.title}-${index}`} index={index}>
              <TiltCard className="pl-deal-tilt">
                <article className="cn-card pl-deal">
                  <div className="pl-deal__media">
                    {card.url ? (
                      <a
                        href={card.url}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        aria-label={`eBay — ${String(card.title).slice(0, 80)}`}
                      >
                        {card.imageUrl ? (
                          <img src={card.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <span className="pl-deal__ph" aria-hidden>
                            ◆
                          </span>
                        )}
                      </a>
                    ) : card.imageUrl ? (
                      <img src={card.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="pl-deal__ph" aria-hidden>
                        ◆
                      </span>
                    )}
                  </div>
                  <div className="pl-deal__body">
                    <h3 className="pl-deal__title">{card.title}</h3>
                    <p className="pl-deal__price">{card.price}</p>
                    {card.url ? (
                      <a
                        className="pl-deal__link"
                        href={card.url}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                      >
                        Voir sur eBay
                        <span className="pl-deal__link-arrow" aria-hidden>
                          →
                        </span>
                      </a>
                    ) : null}
                  </div>
                </article>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      ) : (
        <p className="pl-empty">Aucune annonce pour le moment.</p>
      )}
    </section>
  );
}
