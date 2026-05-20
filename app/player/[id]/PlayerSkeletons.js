/** Fallbacks Suspense — pas de "use client" (CSS animations globales). */

export function PlayerHeroSkeleton() {
  return (
    <header className="player-hero player-hero--skeleton" aria-hidden="true">
      <div className="player-hero__glow" />
      <div className="player-hero__layout">
        <div className="player-skel player-skel--photo" />
        <div className="player-skel player-skel--hero-text">
          <div className="player-skel__line player-skel__line--lg" />
          <div className="player-skel__line player-skel__line--md" />
          <div className="player-skel__chips">
            <div className="player-skel__chip" />
            <div className="player-skel__chip" />
          </div>
        </div>
      </div>
    </header>
  );
}

export function PlayerStatsHistorySkeleton() {
  return (
    <div className="player-prog-skeleton" aria-hidden="true">
      <div className="player__section">
        <div className="player-skel__title" />
        <div className="player-skel-stats">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="player-skel-stat" />
          ))}
        </div>
      </div>
      <div className="player__section">
        <div className="player-skel__title" />
        <div className="player-skel-table">
          {[1, 2, 3, 4, 5].map((k) => (
            <div key={k} className="player-skel-table__row" />
          ))}
        </div>
      </div>
    </div>
  );
}
