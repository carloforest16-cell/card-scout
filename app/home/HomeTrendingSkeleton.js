import AppNav from "../AppNav";
import Atmosphere from "../components/Atmosphere";
import ScrollProgress from "../components/ScrollProgress";

/** Fallback Suspense — shell cinématique instantané pendant le build trending. */
export default function HomeTrendingSkeleton() {
  return (
    <div className="hc-page cinematic">
      <ScrollProgress />
      <Atmosphere />
      <div className="hc-rail">
        <div className="hc-rail__inner">
          <AppNav active={null} />
        </div>
      </div>
      <main className="hc-main">
        <section className="hc-hero" aria-busy="true">
          <p className="cn-eyebrow hc-hero__eyebrow">
            <span className="cn-eyebrow__dot" aria-hidden />
            INTELLIGENCE D&apos;INVESTISSEMENT · CARTES NHL
          </p>
          <div className="hc-skel hc-skel--title" />
          <div className="hc-skel hc-skel--sub" />
          <div className="hc-skel hc-skel--carousel" />
        </section>
      </main>
    </div>
  );
}
