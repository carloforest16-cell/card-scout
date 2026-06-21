"use client";

import { cn } from "@/lib/utils";

const FACTORS = [
  { key: "perf",      label: "Performance",  pct: "14%", color: "#00d4ff" },
  { key: "momentum",  label: "Momentum",     pct: "10%", color: "#22c55e" },
  { key: "accel",     label: "Accélération", pct: "8%",  color: "#a78bfa" },
  { key: "age",       label: "Âge",          pct: "10%", color: "#10b981" },
  { key: "market",    label: "Marché",       pct: "10%", color: "#ffd800" },
  { key: "liquid",    label: "Liquidité",    pct: "4%",  color: "#06b6d4" },
  { key: "risk",      label: "Risque",       pct: "5%",  color: "#3b82f6" },
  { key: "discr",     label: "Discrépance",  pct: "5%",  color: "#f59e0b" },
  { key: "catalysts", label: "Catalyseurs",  pct: "6%",  color: "#ec4899" },
  { key: "upside",    label: "Upside",       pct: "14%", color: "#f97316" },
  { key: "hype",      label: "Hype",         pct: "11%", color: "#f43f5e" },
  { key: "social",    label: "Social",       pct: "3%",  color: "#8b5cf6" },
  { key: "team",      label: "Équipe",       pct: "—",   color: "#475569" },
];

const PATHS = [
  "M 40 40 h 120 q 8 0 8 8 v 92",                           // Performance
  "M 220 30 v 110",                                           // Momentum
  "M 380 50 h -108 q -8 0 -8 8 v 82",                       // Accélération
  "M -25 98 h 180 q 8 0 8 8 v 34",                          // Âge
  "M 30 175 h 108 q 8 0 8 -8 v -22",                        // Marché
  "M -25 238 h 180 q 8 0 8 -8 v -48",                       // Liquidité
  "M 455 98 h -170 q -8 0 -8 8 v 34",                       // Risque
  "M 455 175 h -178",                                         // Discrépance
  "M 455 238 h -170 q -8 0 -8 -8 v -48",                    // Catalyseurs
  "M 60 285 h 90 q 8 0 8 -8 v -60 q 0 -8 8 -8 h 2",        // Upside
  "M 195 330 v -148",                                         // Hype
  "M 250 330 v -148",                                         // Social
  "M 380 285 h -90 q -8 0 -8 -8 v -60 q 0 -8 -8 -8 h -2",  // Équipe
];

const LABELS = [
  { x: 38,   y: 32,  pctY: 44,  anchor: "start"  }, // Performance
  { x: 220,  y: 22,  pctY: 34,  anchor: "middle" }, // Momentum
  { x: 402,  y: 42,  pctY: 54,  anchor: "end"    }, // Accélération
  { x: -28,  y: 90,  pctY: 102, anchor: "start"  }, // Âge
  { x: 28,   y: 167, pctY: 179, anchor: "start"  }, // Marché
  { x: -28,  y: 230, pctY: 242, anchor: "start"  }, // Liquidité
  { x: 458,  y: 90,  pctY: 102, anchor: "end"    }, // Risque
  { x: 458,  y: 167, pctY: 179, anchor: "end"    }, // Discrépance
  { x: 458,  y: 230, pctY: 242, anchor: "end"    }, // Catalyseurs
  { x: 58,   y: 298, pctY: 310, anchor: "start"  }, // Upside
  { x: 190,  y: 345, pctY: 357, anchor: "start"  }, // Hype
  { x: 245,  y: 345, pctY: 357, anchor: "start"  }, // Social
  { x: 382,  y: 298, pctY: 310, anchor: "end"    }, // Équipe
];

export default function ScoreCircuit({ className }) {
  return (
    <div className={cn("score-circuit", className)}>
      <svg
        className="score-circuit__svg"
        width="100%"
        height="100%"
        viewBox="-30 -10 500 400"
        aria-label="Visualisation : 13 facteurs convergent vers le score IA"
        role="img"
      >
        <defs>
          <pattern id="sc-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
          </pattern>

          {PATHS.map((d, i) => (
            <mask key={i} id={`sc-mask-${i + 1}`}>
              <path d={d} strokeWidth="2" stroke="white" fill="none" />
            </mask>
          ))}

          {FACTORS.map((f, i) => (
            <radialGradient key={f.key} id={`sc-grad-${i + 1}`} fx="1">
              <stop offset="0%" stopColor={f.color} />
              <stop offset="50%" stopColor={f.color} stopOpacity="0.6" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          ))}

          <marker id="sc-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="14" markerHeight="14">
            <circle cx="5" cy="5" r="2.5" fill="#0a0a0f" stroke="rgba(255,255,255,0.2)" strokeWidth="0.7">
              <animate attributeName="r" values="0; 3.5; 2.5" dur="0.5s" />
            </circle>
          </marker>

          <linearGradient id="sc-conn-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3a3a" />
            <stop offset="100%" stopColor="#121214" />
          </linearGradient>

          <linearGradient id="sc-text-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)">
              <animate attributeName="offset" values="-2; -1; 0" dur="4s" repeatCount="indefinite" calcMode="spline" keyTimes="0; 0.5; 1" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            </stop>
            <stop offset="25%" stopColor="white">
              <animate attributeName="offset" values="-1; 0; 1" dur="4s" repeatCount="indefinite" calcMode="spline" keyTimes="0; 0.5; 1" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            </stop>
            <stop offset="50%" stopColor="rgba(255,255,255,0.4)">
              <animate attributeName="offset" values="0; 1; 2" dur="4s" repeatCount="indefinite" calcMode="spline" keyTimes="0; 0.5; 1" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
            </stop>
          </linearGradient>

          <filter id="sc-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#00d4ff" floodOpacity="0.12" />
          </filter>
        </defs>

        <rect x="-30" y="-10" width="500" height="400" fill="url(#sc-grid)" />

        <g stroke="rgba(255,255,255,0.12)" fill="none" strokeWidth="1" strokeDasharray="100 100" pathLength="100" markerStart="url(#sc-dot)">
          {PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur="1s" fill="freeze" calcMode="spline" keySplines="0.25,0.1,0.5,1" keyTimes="0; 1" />
        </g>

        {FACTORS.map((f, i) => (
          <g key={f.key} mask={`url(#sc-mask-${i + 1})`}>
            <circle className={`sc-circuit sc-line-${i + 1}`} cx="0" cy="0" r="12" fill={`url(#sc-grad-${i + 1})`} />
          </g>
        ))}

        {FACTORS.map((f, i) => {
          const lbl = LABELS[i];
          return (
            <g key={f.key}>
              <text x={lbl.x} y={lbl.y} fontSize="11" fontWeight="600" fill={f.color} textAnchor={lbl.anchor} letterSpacing="0.03em" opacity="0.85">
                {f.label}
              </text>
              <text x={lbl.x} y={lbl.pctY} fontSize="9" fontWeight="500" fill="rgba(255,255,255,0.3)" textAnchor={lbl.anchor} fontFamily="monospace">
                {f.pct}
              </text>
            </g>
          );
        })}

        <g>
          <g fill="url(#sc-conn-grad)">
            <rect x="186" y="132" width="4" height="8" rx="1.5" />
            <rect x="200" y="132" width="4" height="8" rx="1.5" />
            <rect x="216" y="132" width="4" height="8" rx="1.5" />
            <rect x="232" y="132" width="4" height="8" rx="1.5" />
            <rect x="248" y="132" width="4" height="8" rx="1.5" />
            <rect x="186" y="182" width="4" height="8" rx="1.5" />
            <rect x="200" y="182" width="4" height="8" rx="1.5" />
            <rect x="216" y="182" width="4" height="8" rx="1.5" />
            <rect x="232" y="182" width="4" height="8" rx="1.5" />
            <rect x="248" y="182" width="4" height="8" rx="1.5" />
            <rect x="155" y="148" width="8" height="4" rx="1.5" />
            <rect x="155" y="160" width="8" height="4" rx="1.5" />
            <rect x="155" y="172" width="8" height="4" rx="1.5" />
            <rect x="277" y="148" width="8" height="4" rx="1.5" />
            <rect x="277" y="160" width="8" height="4" rx="1.5" />
            <rect x="277" y="172" width="8" height="4" rx="1.5" />
          </g>

          <rect x="163" y="140" width="114" height="42" rx="4" fill="#0a0a0f" stroke="rgba(255,255,255,0.08)" strokeWidth="1" filter="url(#sc-shadow)" />
          <rect x="165" y="142" width="110" height="38" rx="3" fill="none" stroke="rgba(0,212,255,0.08)" strokeWidth="0.5" />

          <text x="220" y="157" fontSize="9" fontWeight="700" fill="url(#sc-text-grad)" textAnchor="middle" letterSpacing="0.12em">AI SCORE</text>
          <text x="220" y="173" fontSize="14" fontWeight="900" fill="#00d4ff" textAnchor="middle" letterSpacing="-0.02em">
            8.2
            <tspan fontSize="9" fill="rgba(255,255,255,0.4)">/10</tspan>
          </text>
        </g>
      </svg>
    </div>
  );
}
