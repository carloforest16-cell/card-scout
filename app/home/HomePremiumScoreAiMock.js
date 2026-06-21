/* eslint-disable @next/next/no-img-element -- URL headshot NHL officielle */

const CAUFIELD_HEADSHOT =
  "https://assets.nhle.com/mugs/nhl/20242025/MTL/8481540.png";

const FACTORS = [
  { key: "perf", label: "Performance", barClass: "hp-ai-mock__factor-fill--perf" },
  { key: "traj", label: "Trajectoire", barClass: "hp-ai-mock__factor-fill--traj" },
  { key: "mkt", label: "Marché", barClass: "hp-ai-mock__factor-fill--mkt" },
  { key: "age", label: "Âge", barClass: "hp-ai-mock__factor-fill--age" },
];

export default function HomePremiumScoreAiMock() {
  return (
    <div
      className="hp-ai-mock"
      role="img"
      aria-label="Démonstration du score Card Metrics sur Cole Caufield : analyse, facteurs, score 8.2 sur 10"
    >
      <div className="hp-ai-mock__chrome">
        <span className="hp-ai-mock__dot" aria-hidden />
        <span className="hp-ai-mock__dot" aria-hidden />
        <span className="hp-ai-mock__dot" aria-hidden />
        <span className="hp-ai-mock__url">cardmetrics.io/player/caufield</span>
      </div>
      <div className="hp-ai-mock__body">
        <div className="hp-ai-mock__player">
          <img
            src={CAUFIELD_HEADSHOT}
            alt=""
            width={112}
            height={140}
            className="hp-ai-mock__photo"
            loading="lazy"
            decoding="async"
          />
          <div>
            <p className="hp-ai-mock__name">Cole Caufield</p>
            <p className="hp-ai-mock__meta">MTL · RW</p>
          </div>
        </div>

        <div className="hp-ai-mock__sequence">
          <div className="hp-ai-mock__swap">
            <div className="hp-ai-mock__layer hp-ai-mock__layer--analyze">
              <div className="hp-ai-mock__analyzing">
                <p className="hp-ai-mock__status">🧠 Analyse en cours…</p>
                <div className="hp-ai-mock__pulse-row" aria-hidden>
                  <span className="hp-ai-mock__pulse-bar" />
                  <span className="hp-ai-mock__pulse-bar" />
                  <span className="hp-ai-mock__pulse-bar" />
                </div>
              </div>
            </div>
            <div className="hp-ai-mock__layer hp-ai-mock__layer--factors">
              <div className="hp-ai-mock__factors">
                {FACTORS.map((f) => (
                  <div key={f.key} className="hp-ai-mock__factor">
                    <div className="hp-ai-mock__factor-head">
                      <span>{f.label}</span>
                    </div>
                    <div className="hp-ai-mock__factor-track">
                      <div className={`hp-ai-mock__factor-fill ${f.barClass}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hp-ai-mock__layer hp-ai-mock__layer--score">
            <div className="hp-ai-mock__score-block">
              <span className="hp-ai-mock__score-label">Card Metrics Score</span>
              <p className="hp-ai-mock__score-num">
                8.2
                <span className="hp-ai-mock__score-max">/10</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
