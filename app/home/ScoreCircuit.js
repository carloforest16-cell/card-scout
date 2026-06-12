"use client";

import { cn } from "@/lib/utils";

const FACTORS = [
  { key: "perf", label: "Performance", color: "#00d4ff" },
  { key: "momentum", label: "Momentum", color: "#22c55e" },
  { key: "age", label: "Âge", color: "#a78bfa" },
  { key: "market", label: "Marché", color: "#ffd800" },
  { key: "liquidity", label: "Liquidité", color: "#3b82f6" },
  { key: "upside", label: "Upside", color: "#f97316" },
  { key: "hype", label: "Hype", color: "#f43f5e" },
];

export default function ScoreCircuit({ className }) {
  return (
    <div className={cn("score-circuit", className)}>
      <svg
        className="score-circuit__svg"
        width="100%"
        height="100%"
        viewBox="-10 0 460 320"
        aria-label="Visualisation : 7 facteurs convergent vers le score IA"
        role="img"
      >
        {/* Grid background pattern */}
        <defs>
          <pattern id="sc-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x="-10" width="460" height="320" fill="url(#sc-grid)" />

        {/* Circuit paths */}
        <g
          stroke="rgba(255,255,255,0.12)"
          fill="none"
          strokeWidth="1"
          strokeDasharray="100 100"
          pathLength="100"
          markerStart="url(#sc-dot)"
        >
          {/* 1. Performance — top-left */}
          <path d="M 40 40 h 120 q 8 0 8 8 v 92" />
          {/* 2. Momentum — top-center */}
          <path d="M 220 30 v 110" />
          {/* 3. Âge — top-right */}
          <path d="M 380 50 h -108 q -8 0 -8 8 v 82" />
          {/* 4. Marché — left */}
          <path d="M 30 175 h 108 q 8 0 8 -8 v -22" />
          {/* 5. Liquidité — right */}
          <path d="M 390 170 h -96 q -8 0 -8 -8 v -17" />
          {/* 6. Upside — bottom-left */}
          <path d="M 60 285 h 90 q 8 0 8 -8 v -60 q 0 -8 8 -8 h 2" />
          {/* 7. Hype — bottom-right */}
          <path d="M 360 280 h -68 q -8 0 -8 -8 v -55 q 0 -8 -8 -8 h -12" />

          <animate
            attributeName="stroke-dashoffset"
            from="100"
            to="0"
            dur="1s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.25,0.1,0.5,1"
            keyTimes="0; 1"
          />
        </g>

        {/* Animated light trails */}
        {/* 1. Performance */}
        <g mask="url(#sc-mask-1)">
          <circle className="sc-circuit sc-line-1" cx="0" cy="0" r="12" fill="url(#sc-grad-1)" />
        </g>
        {/* 2. Momentum */}
        <g mask="url(#sc-mask-2)">
          <circle className="sc-circuit sc-line-2" cx="0" cy="0" r="12" fill="url(#sc-grad-2)" />
        </g>
        {/* 3. Âge */}
        <g mask="url(#sc-mask-3)">
          <circle className="sc-circuit sc-line-3" cx="0" cy="0" r="12" fill="url(#sc-grad-3)" />
        </g>
        {/* 4. Marché */}
        <g mask="url(#sc-mask-4)">
          <circle className="sc-circuit sc-line-4" cx="0" cy="0" r="12" fill="url(#sc-grad-4)" />
        </g>
        {/* 5. Liquidité */}
        <g mask="url(#sc-mask-5)">
          <circle className="sc-circuit sc-line-5" cx="0" cy="0" r="12" fill="url(#sc-grad-5)" />
        </g>
        {/* 6. Upside */}
        <g mask="url(#sc-mask-6)">
          <circle className="sc-circuit sc-line-6" cx="0" cy="0" r="12" fill="url(#sc-grad-6)" />
        </g>
        {/* 7. Hype */}
        <g mask="url(#sc-mask-7)">
          <circle className="sc-circuit sc-line-7" cx="0" cy="0" r="12" fill="url(#sc-grad-7)" />
        </g>

        {/* Factor labels at path starts */}
        {[
          { x: 40, y: 32, label: "Performance", color: "#00d4ff", anchor: "start" },
          { x: 220, y: 22, label: "Momentum", color: "#22c55e", anchor: "middle" },
          { x: 380, y: 42, label: "Âge", color: "#a78bfa", anchor: "start" },
          { x: 30, y: 168, label: "Marché", color: "#ffd800", anchor: "start" },
          { x: 390, y: 163, label: "Liquidité", color: "#3b82f6", anchor: "start" },
          { x: 60, y: 296, label: "Upside", color: "#f97316", anchor: "start" },
          { x: 360, y: 291, label: "Hype", color: "#f43f5e", anchor: "start" },
        ].map((f) => (
          <text
            key={f.label}
            x={f.x}
            y={f.y}
            fontSize="11"
            fontWeight="600"
            fill={f.color}
            textAnchor={f.anchor}
            letterSpacing="0.03em"
            opacity="0.85"
          >
            {f.label}
          </text>
        ))}

        {/* Weight labels */}
        {[
          { x: 40, y: 52, label: "20%", anchor: "start" },
          { x: 220, y: 46, label: "20%", anchor: "middle" },
          { x: 380, y: 62, label: "15%", anchor: "start" },
          { x: 30, y: 188, label: "15%", anchor: "start" },
          { x: 390, y: 183, label: "10%", anchor: "start" },
          { x: 60, y: 276, label: "10%", anchor: "start" },
          { x: 360, y: 271, label: "10%", anchor: "start" },
        ].map((f, i) => (
          <text
            key={i}
            x={f.x}
            y={f.y}
            fontSize="9"
            fontWeight="500"
            fill="rgba(255,255,255,0.3)"
            textAnchor={f.anchor}
            fontFamily="monospace"
          >
            {f.label}
          </text>
        ))}

        {/* Central SCORE block */}
        <g>
          {/* Connection pins */}
          <g fill="url(#sc-conn-grad)">
            <rect x="190" y="132" width="4" height="8" rx="1.5" />
            <rect x="210" y="132" width="4" height="8" rx="1.5" />
            <rect x="230" y="132" width="4" height="8" rx="1.5" />
            <rect x="246" y="132" width="4" height="8" rx="1.5" />
            <rect x="190" y="182" width="4" height="8" rx="1.5" />
            <rect x="210" y="182" width="4" height="8" rx="1.5" />
            <rect x="230" y="182" width="4" height="8" rx="1.5" />
            <rect x="246" y="182" width="4" height="8" rx="1.5" />
            <rect x="155" y="152" width="8" height="4" rx="1.5" />
            <rect x="155" y="166" width="8" height="4" rx="1.5" />
            <rect x="277" y="152" width="8" height="4" rx="1.5" />
            <rect x="277" y="166" width="8" height="4" rx="1.5" />
          </g>

          {/* Main chip */}
          <rect
            x="163"
            y="140"
            width="114"
            height="42"
            rx="4"
            fill="#0a0a0f"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
            filter="url(#sc-shadow)"
          />

          {/* Chip inner glow */}
          <rect
            x="165"
            y="142"
            width="110"
            height="38"
            rx="3"
            fill="none"
            stroke="rgba(0,212,255,0.08)"
            strokeWidth="0.5"
          />

          {/* AI SCORE text */}
          <text
            x="220"
            y="157"
            fontSize="9"
            fontWeight="700"
            fill="url(#sc-text-grad)"
            textAnchor="middle"
            letterSpacing="0.12em"
          >
            AI SCORE
          </text>
          <text
            x="220"
            y="173"
            fontSize="14"
            fontWeight="900"
            fill="#00d4ff"
            textAnchor="middle"
            letterSpacing="-0.02em"
          >
            8.2
            <tspan fontSize="9" fill="rgba(255,255,255,0.4)">/10</tspan>
          </text>
        </g>

        {/* Masks for light trails */}
        <defs>
          <mask id="sc-mask-1">
            <path d="M 40 40 h 120 q 8 0 8 8 v 92" strokeWidth="2" stroke="white" fill="none" />
          </mask>
          <mask id="sc-mask-2">
            <path d="M 220 30 v 110" strokeWidth="2" stroke="white" fill="none" />
          </mask>
          <mask id="sc-mask-3">
            <path d="M 380 50 h -108 q -8 0 -8 8 v 82" strokeWidth="2" stroke="white" fill="none" />
          </mask>
          <mask id="sc-mask-4">
            <path d="M 30 175 h 108 q 8 0 8 -8 v -22" strokeWidth="2" stroke="white" fill="none" />
          </mask>
          <mask id="sc-mask-5">
            <path d="M 390 170 h -96 q -8 0 -8 -8 v -17" strokeWidth="2" stroke="white" fill="none" />
          </mask>
          <mask id="sc-mask-6">
            <path d="M 60 285 h 90 q 8 0 8 -8 v -60 q 0 -8 8 -8 h 2" strokeWidth="2" stroke="white" fill="none" />
          </mask>
          <mask id="sc-mask-7">
            <path d="M 360 280 h -68 q -8 0 -8 -8 v -55 q 0 -8 -8 -8 h -12" strokeWidth="2" stroke="white" fill="none" />
          </mask>

          {/* Radial gradients for each light */}
          {FACTORS.map((f, i) => (
            <radialGradient key={f.key} id={`sc-grad-${i + 1}`} fx="1">
              <stop offset="0%" stopColor={f.color} />
              <stop offset="50%" stopColor={f.color} stopOpacity="0.6" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          ))}

          {/* Dot marker */}
          <marker
            id="sc-dot"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="14"
            markerHeight="14"
          >
            <circle cx="5" cy="5" r="2.5" fill="#0a0a0f" stroke="rgba(255,255,255,0.2)" strokeWidth="0.7">
              <animate attributeName="r" values="0; 3.5; 2.5" dur="0.5s" />
            </circle>
          </marker>

          {/* Connection gradient */}
          <linearGradient id="sc-conn-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3a3a" />
            <stop offset="100%" stopColor="#121214" />
          </linearGradient>

          {/* Text shimmer gradient */}
          <linearGradient id="sc-text-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.4)">
              <animate
                attributeName="offset"
                values="-2; -1; 0"
                dur="4s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0; 0.5; 1"
                keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
              />
            </stop>
            <stop offset="25%" stopColor="white">
              <animate
                attributeName="offset"
                values="-1; 0; 1"
                dur="4s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0; 0.5; 1"
                keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
              />
            </stop>
            <stop offset="50%" stopColor="rgba(255,255,255,0.4)">
              <animate
                attributeName="offset"
                values="0; 1; 2"
                dur="4s"
                repeatCount="indefinite"
                calcMode="spline"
                keyTimes="0; 0.5; 1"
                keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
              />
            </stop>
          </linearGradient>

          <filter id="sc-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#00d4ff" floodOpacity="0.12" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
