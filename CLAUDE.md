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

## Environment Variables

Copy `.env.example` to `.env.local`. Required:
- `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` — eBay OAuth (client_credentials flow)
- `DEEPSEEK_API_KEY` — DeepSeek API (model: `deepseek-chat`)
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase (cache, scores, alerts)
- `CRON_SECRET` — Bearer token protecting `/api/cron/opportunites`

## Architecture

**Next.js 15 app** deployed on Vercel. All UI is in French.

### Pages & API Routes

| Route | Purpose |
|---|---|
| `/` | Home — hero, trending carousel, deal preview |
| `/deals` | Deal Finder — search player → eBay listings with AI scores |
| `/opportunites` | Top 8 investment opportunities (cached 14 days) |
| `/player/[id]` | Player detail — stats, Card Scout Score, eBay deals |
| `GET /api/player?q=` | NHL player search |
| `GET /api/deals?player=&mode=` | eBay listings + AI investment scores |
| `GET /api/deals/hottest` | Hottest current deals |
| `GET /api/opportunites/top` | Top opportunities (Blob-cached) |
| `GET /api/score?playerId=` | Card Scout Score for a player |
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

### Card Scout Score (7 factors)

Performance (20%), Momentum (20%), Age (15%), Market Value (15%), Liquidity (10%), Upside (10%), Hype (10%). DeepSeek adjusts final score by ±0.5 based on qualitative context.

### Caching Strategy

Two layers: in-memory (per-process) and Supabase `cache_generic` table (persistent).

| Cache key | TTL | Layer |
|---|---|---|
| Per-player deals | 2 hours | Memory |
| Cole Caufield deals | 6 hours | Supabase |
| Trending players | 24 hours | Supabase |
| Underdog players | 24 hours | Supabase |
| Top opportunities | 14 days | Supabase |

## UI/UX Pro Max Skill

Design intelligence for all UI work. Contains 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types. Requires Python 3.

### When to Use

**Must use** when: designing/refactoring pages or components, choosing colors/typography/layout, reviewing UI for accessibility or visual quality, implementing animations or responsive behavior.

**Skip** for: pure backend logic, API/database design, infrastructure work.

### Search Commands

```bash
# Full design system (always start here for new pages)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<product_type> <keywords>" --design-system -p "Card Scout"

# Domain search (supplement after design system)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain>

# Stack-specific (Next.js)
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack nextjs

# Persist design system across sessions
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Card Scout"
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
