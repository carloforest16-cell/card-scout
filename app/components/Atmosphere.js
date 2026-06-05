/**
 * Atmospheric elements — grain overlay, ambient orbs, grid backdrop.
 * Pure CSS, no JS. Mount once near the top of a `.cinematic` page.
 */

export function GrainOverlay() {
  // SVG turbulence noise inlined for performance
  return (
    <div className="cn-grain" aria-hidden>
      <svg
        width="0"
        height="0"
        style={{ position: "absolute" }}
        aria-hidden
      >
        <filter id="cn-grain-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.45 0" />
        </filter>
      </svg>
    </div>
  );
}

export function AmbientOrbs() {
  return (
    <div className="cn-orbs" aria-hidden>
      <div className="cn-orb cn-orb--ice" />
      <div className="cn-orb cn-orb--gold" />
      <div className="cn-orb cn-orb--ice cn-orb--alt" />
    </div>
  );
}

export function GridBackdrop() {
  return <div className="cn-grid-bg" aria-hidden />;
}

/** Full atmospheric stack — grain + orbs + grid. */
export default function Atmosphere() {
  return (
    <>
      <GridBackdrop />
      <AmbientOrbs />
      <GrainOverlay />
    </>
  );
}
