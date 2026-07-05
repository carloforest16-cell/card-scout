# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm start        # Start production server
npm run lint     # ESLint (Next.js core-web-vitals config)
```

No test suite is configured.

## CI

Two GitHub Actions workflows (`.github/workflows/`):

- **`ci.yml`** — runs on every push and PR: `npm ci`, `npm run lint`, `npm run build`. Fails the job if the build log contains `Attempted import error` — this exact string masked a broken-import bug in prod for 2 weeks after the June 20 Card Scout → Card Metrics rename (commit `d663fd5`), because nothing was watching for it.
- **`smoke-prod.yml`** — daily schedule + manual dispatch: runs `scripts/smoke.mjs` against `https://cardmetrics.io` (12 public routes/APIs, no auth, no `?refresh=1`).

Rule: the build step must never require real secrets to go green — use inert placeholder values if a step genuinely needs an env var to exist. After every push, check that CI is green before considering the work done. Enabling GitHub branch protection on `main` to require this workflow is a manual step in repo settings — not automatable from here.

## Environment Variables

Copy `.env.example` to `.env.local`. Required:
- `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` — eBay OAuth (client_credentials flow)
- `DEEPSEEK_API_KEY` — DeepSeek API (model: `deepseek-chat`)
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase (cache, scores, alerts)
- `CRON_SECRET` — Bearer token protecting `/api/cron/opportunites`

## Architecture

**Next.js 15 app** deployed on Vercel at **cardmetrics.io**. All UI is in French. Brand name: **Card Metrics** (internal JS identifiers still use `cardScout*` — intentional, not user-visible).

### Pages & API Routes

| Route | Purpose |
|---|---|
| `/` | Home — hero, trending carousel, deal preview |
| `/deals` | Deal Finder — search player → eBay listings with AI scores |
| `/opportunites` | Top 8 investment opportunities (cached 14 days) |
| `/player/[id]` | Player detail — stats, Card Metrics Score, eBay deals |
| `GET /api/player?q=` | NHL player search |
| `GET /api/deals?player=&mode=` | eBay listings + AI investment scores |
| `GET /api/deals/hottest` | Hottest current deals |
| `GET /api/opportunites/top` | Top opportunities (Blob-cached) |
| `GET /api/score?playerId=` | Card Metrics Score for a player |
| `GET /api/cron/opportunites` | Vercel Cron (1st & 15th at 6 AM UTC) — refreshes opportunities cache |

### Core Libraries (`lib/`)

| Module | Role |
|---|---|
| `dealFinder.js` | Orchestrates eBay search → filter → categorize → score for a player; manages memory + Blob cache |
| `ebayServer.js` | eBay API client with OAuth token refresh; USD→CAD conversion (×1.37) |
| `dealInvestmentScore.js` | DeepSeek call to score individual listings (score 0–10, verdict: Acheter/Surveiller/Passer, hold timeline) |
| `cardScoutScore.js` | 7-factor score algorithm + DeepSeek ±0.5 adjustment |
| `cardScoutScoreMath.js` | Pure math for the 7 score factors |
| `opportunitesTop.js` | Batch-scores ~75 players, generates DeepSeek narratives, caches top 8 to Blob (14d TTL) |
| `nhlPlayerLanding.js` | NHL API client (player stats, bio, headshot) |
| `nhlPlayerLandingCached.js` | In-memory cache wrapper around nhlPlayerLanding |
| `trendingData.js` | Curated 30-player list with eBay pricing lookup |
| `underdogFinder.js` | Emerging players from NHL Stats API (age ≤30, ≥10 GP filter) |
| `dealsHottest.js` | Ranks deals for the hottest-deals endpoint |
| `verdictTone.js` | Maps verdict strings to CSS tone classes |
| `cardNumberExtractor.js` | Parses card numbers from eBay listing titles |

### Data Flow: Deal Finder

```
User searches player
  → getDealFinderResult() checks Blob cache (Cole Caufield: 6h TTL) then memory cache (2h)
  → fetchEbayHockeyCardListingsForPlayer() — eBay Browse API
  → Filter: exclude reprints, lots, jerseys, fan art
  → Categorize into groups: Young Guns, Auto, Canvas, Graded (PSA/BGS), Parallel, etc.
  → buildInvestmentBasePayload() — cheapest per group, top 20 by price
  → scoreListingsForInvestment() — DeepSeek batch (max 15 listings/call)
  → Merge with heuristic fallback scores
  → Return to client
```

### Card Metrics Score (v7.1 — 13 facteurs tous pondérés)

Performance (14%), Momentum (10%), Accélération (8%), Âge (10%), Marché (10%), Liquidité (4%), Upside (14%), Hype (7%), Discrépance Marché (5%), Risque (5%), Catalyseurs (6%), Social/Wikipedia (3%), Équipe (4%). Total = 100%. Les 4 sous-scores avancés (catalysts, risk, marketDiscrepancy, socialAttention) tournent via le cron `enrich-scores` quotidien — pas en fastMode. DeepSeek ajuste le score final de ±0.5 selon le contexte qualitatif. Sport-agnostic via `lib/sportConfig.js`.

### Caching Strategy

Two layers: in-memory (per-process) and Supabase `cache_generic` table (persistent).

| Cache key | TTL | Layer |
|---|---|---|
| Per-player deals | 2 hours | Memory |
| Cole Caufield deals | 6 hours | Supabase |
| Trending players | 24 hours | Supabase |
| Underdog players | 24 hours | Supabase |
| Top opportunities | 14 days | Supabase |

## Guardrails

- Never present fake data as real. If real data doesn't exist yet: an honest empty state ("en construction", "données insuffisantes") or hide the widget — never a synthetic seed/fallback dressed up as live data.
- UI is 100% French (fr-CA), prices in CAD by default. AI = DeepSeek only (`deepseek-chat`), never Anthropic.
- Never modify the score weights (`cardScoutScoreMath.js`) without an explicit task to do so.
- Respect `prefers-reduced-motion` on animations. No emojis as icons (SVG/lucide only).
- No new heavy dependency without real necessity (`framer-motion` + `lucide-react` already cover ~95% of cases). Light dev-only deps (e.g. `knip`) are fine when justified.
- Before any page redesign, run the design skill: `python .claude/skills/ui-ux-pro-max/scripts/search.py "<page type> <keywords>" --design-system -p "Card Metrics"`.
- eBay does NOT provide sold prices (the Finding API is dead, Marketplace Insights needs elevated access `fetchSoldComps` gates on). Sold comps come from **130point** (`lib/soldPrices.js`, scraping, 24h cache) via `lib/marketValue.js`. Never propose the eBay sold API as a fix.
- Internal identifiers `cardScout*` are intentional (visible brand = Card Metrics). Do not rename them — a rename exactly like this broke prod for 2 weeks in June (see CI section above).
- No test suite exists. `npm run lint` + the CI build gate are the only automated nets — always also verify manually in preview.
- All fallback `catch` blocks that serve stale/cached data on failure must log (`console.error`, module-prefixed) — a silent `catch` in `getTopOpportunites` served a stale cache in prod for 2 weeks in June with zero trace anywhere.

## Known Pitfalls

- `npm run build` and the `npm run dev` preview server share the same `.next` directory — running a build while the preview is up can corrupt its incremental cache (`Cannot find module './XXXX.js'`, a working route suddenly 500s). If a preview route breaks right after a build, restart the preview server before assuming it's a real bug.
- Long-lived caches (Supabase `cache_generic` via `lib/persistentCache.js`: hottest deals 6h, auctions 30min, 130point sold prices 24h, top opportunities 14 days) mask freshly-deployed code changes in preview. Use `?refresh=1` on the public route when supported — but a `forceRefresh` can take minutes; fire it without awaiting in `preview_eval` (30s timeout) and check back later rather than blocking.
- `grep --include="*.js"` misses `.jsx` files — always search both extensions, and verify the actual importer chain (`grep -rn "ComponentName"`) before declaring a file dead or live. A restricted grep once caused two dead copies of an array to be mistaken for live code on `/player/[id]`.
- `AnimatePresence mode="wait"` (framer-motion) can get stuck with content never shown. For text that must reliably render, prefer pure CSS animation (`@keyframes` + a changing React `key`).
- In automated preview sessions, `document.hidden === true` freezes JS/CSS animations — verify DOM presence/content, not mid-animation opacity.
- Dev server default port is 3001 (`npm run dev -- --port 3001`); 3000 is often occupied elsewhere.
- No external `fetch()` in `lib/` had a timeout until this was fixed — all now use `AbortSignal.timeout(...)` (8s for simple APIs, 30s for DeepSeek calls with thinking).

## UI/UX Pro Max Skill

Design intelligence for all UI work. Contains 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types. Requires Python 3.

### When to Use

**Must use** when: designing/refactoring pages or components, choosing colors/typography/layout, reviewing UI for accessibility or visual quality, implementing animations or responsive behavior.

**Skip** for: pure backend logic, API/database design, infrastructure work.

### Search Commands

```bash
# Full design system (always start here for new pages)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<product_type> <keywords>" --design-system -p "Card Metrics"

# Domain search (supplement after design system)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain>

# Stack-specific (Next.js)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack nextjs

# Persist design system across sessions
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Card Metrics"
```

**Domains:** `product` `style` `color` `typography` `landing` `chart` `ux` `google-fonts` `react` `web` `prompt`

### Rule Priority (1 = highest)

| Priority | Category | Key Rules |
|---|---|---|
| 1 | Accessibility | Contrast 4.5:1, alt text, keyboard nav, aria-labels |
| 2 | Touch & Interaction | Min 44×44px targets, 8px+ spacing, loading feedback |
| 3 | Performance | WebP/AVIF, lazy load, reserve space (CLS < 0.1) |
| 4 | Style Selection | Match product type, consistent style, SVG icons only |
| 5 | Layout & Responsive | Mobile-first, no horizontal scroll, consistent breakpoints |
| 6 | Typography & Color | Base 16px body, line-height 1.5, semantic color tokens |
| 7 | Animation | 150–300ms micro-interactions, transform/opacity only |
| 8 | Forms & Feedback | Visible labels, errors near field, submit feedback |
| 9 | Navigation | Predictable back, bottom nav ≤5, deep linking |
| 10 | Charts & Data | Legends, tooltips, accessible color pairs |

### Pre-Delivery Checklist

- [ ] No emojis as icons (use SVG)
- [ ] Touch targets ≥44px, no hover-only interactions
- [ ] Primary text contrast ≥4.5:1 (check both light and dark)
- [ ] Mobile layout tested at 375px width
- [ ] Animations respect `prefers-reduced-motion`
- [ ] Form errors shown near the field, not just at top
- [ ] No horizontal scroll on mobile

### External APIs

- **eBay** — `https://api.ebay.com` — card listings (default marketplace: `EBAY_CA`)
- **NHL** — `https://search.d3.nhle.com` (player search) + `https://api-web.nhle.com` (player landing) + `https://api.nhle.com/stats` (skater bios)
- **DeepSeek** — `deepseek-chat` for all AI calls (cost-optimized)
- **Supabase** — `cache_generic` table for persistent cache (replaced Vercel Blob)

### Existing Design Tokens (don't invent new ones)

- Colors: `--void` (background), `--platinum`/`--silver`/`--ghost` (text), `--ice` `#00d4ff` (primary accent), `--gold` `#ffb61e`, `--profit` (green), `--loss` (red), `--border-cn`, `--surface`, `--abyss`.
- Fonts: `--cn-hero` (Bebas-like display), `--cn-display`, `--cn-body`, `--cn-mono`.
- Primitives: `cn-btn`, `cn-badge` (`--profit`/`--warn`), `cn-eyebrow`, `cn-card`, `cn-h1`/`cn-h2`, plus components `Reveal`, `TiltCard`, `Skeleton`, `SpotlightCard`.
- Reusable "WOW" patterns from the home page: `SplitWords` (masked words that rise in), `CountUp` (`app/components/CountUp.js` — reuse this one, don't duplicate it elsewhere), `hw-btn-shine` (light sweep), native scroll reveals via `animation-timeline: view()` (`home-wow.css`), pinned section (`ScrollStory.js`), browser-chrome mockups (`hc-score-mock__chrome`). Generic, non-home-scoped versions live in `app/components/wow/wow.css` (`.wow-rise`, `.wow-btn-shine`, `.wow-card-hover`) — prefer these for new pages over the home-scoped originals.
