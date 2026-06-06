/** Fallbacks Suspense — pas de "use client" (animations CSS globales). */

export function PlayerHeroSkeleton() {
  return (
    <header className="pl-hero pl-hero--skeleton" aria-hidden="true">
      <div className="pl-skel pl-skel--photo" />
      <div className="pl-hero__info">
        <div className="pl-skel pl-skel--line pl-skel--line-lg" />
        <div className="pl-skel pl-skel--line pl-skel--line-md" />
      </div>
      <div className="pl-skel pl-skel--gauge" />
    </header>
  );
}

export function PlayerStatsHistorySkeleton() {
  return (
    <section className="pl-section" aria-hidden="true">
      <div className="pl-skel pl-skel--line pl-skel--line-sm" />
      <div className="pl-statgrid">
        {[1, 2, 3, 4].map((k) => (
          <div key={k} className="pl-skel pl-skel--stat" />
        ))}
      </div>
    </section>
  );
}
