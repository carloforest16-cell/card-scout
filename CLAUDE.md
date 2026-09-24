# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm start        # Start production server
npm run lint     # ESLint (Next.js core-web-vitals config)
npm run social   # Reels vidéo (MP4 9:16) + posts Instagram sur les vraies données du jour → social-posts/<date>/ (scripts/social/, ffmpeg-static)
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
- `CRON_SECRET` — Bearer token protecting `/api/cron/*` routes and `/api/health`
- `ADMIN_ALERT_EMAIL` — optional; if set (with `RESEND_API_KEY`), `/api/cron/health-check` emails this address when system health is `warn`/`error`

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
| `/joueurs` | NHL player directory — browse, filter, sort by score/points/name/age |
| `GET /api/joueurs` | Paginated player list from `players` table + scores; params: search, team, position, sort, order, page, limit |
| `GET /api/cron/sync-players` | Vercel Cron (Monday 3 AM UTC) — syncs all NHL skaters into `players` table |

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
| `playerDirectory.js` | `syncAllPlayers()` — fetches all NHL skaters, upserts to `players` table in batches of 100 |
| `playerScores.js` | Score persistence: write-through, top scored, recompute (two-speed: full for top 100, math for extended pool) |
| `soldListings.js` | FREE real sold prices via official eBay Browse API: collects panel auctions ending within ~26 h (`sold_listings`, status `pending`), then `getItem` after the end returns the final bid + `estimatedSoldQuantity` (1 = sold) — still available months later. Budget-aware (reads Browse quota, keeps 1500 calls in reserve, ≤6 auctions/player). Cron `sold-listings` daily 7:30 UTC |
| `backtest.js` | Pure backtest math (no I/O): score at T vs price change of the SAME cards (cohort = player+card_type+grade, `ALL` row excluded), score tiers, Spearman, reliability gate. Tested by `npm run test:backtest` (CI) |

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

### Score Source of Truth

`player_scores` (Supabase) is the single source of truth for all Card Metrics Scores. Rules:
- `recompute-scores` cron: **top 100 by points** → full score (eBay + DeepSeek, `scoreMode: "full"`). Extended pool (GP ≥ 10, outside top 100) → math-only (`scoreMode: "math"`, `computeFactorScores`, no eBay/DeepSeek).
- `/api/score` serves from `player_scores` when fresh (< 10 days). When stale, it recalculates live **and immediately writes the result back** (write-through via `writeBackPlayerScore` in `lib/playerScores.js`).
- Never display a live-calculated score without persisting it — this causes divergence between `/player/[id]` and `/opportunites`.
- All `ORDER BY score DESC` queries must include tie-break: `score DESC, points DESC, player_id ASC`.
- `scoreMode: "math"` scores must never show a DeepSeek verdict or narrative (UI shows "Score de base · stats uniquement" badge instead).
- Top opportunities (`buildTopOpportunitesFromDb`, `getTopStoredScores`) filter out `scoreMode = "math"` rows — narratives require full data.
- `player_scores` also holds retired legends (Gretzky, Roy…) persisted by `/player/[id]` write-through. Every public ranking (top opportunities, Picks, Pulse, movers, digest « joueur du jour ») must pass through `keepActivePlayers()` (`lib/playerScores.js`, active roster from `players`).

### Player Directory

`players` table (Supabase) — complete roster of active NHL skaters, synced weekly by `sync-players` cron (Monday 3 AM UTC). Schema: `player_id`, `full_name`, `team_abbrev`, `position_code`, `birth_date`, `age`, `games_played`, `goals`, `assists`, `points`, `headshot_url`, `sport`, `season_id`, `is_active`, `synced_at`. Backed by `lib/playerDirectory.js` (`syncAllPlayers()`).

`/joueurs` page reads from `players` LEFT JOIN `player_scores` (via `/api/joueurs`). Cache: 5 min in-memory per-process. Backfill: trigger "Sync Annuaire Joueurs" in admin panel after first deploy.

### Caching Strategy

Two layers: in-memory (per-process) and Supabase `cache_generic` table (persistent).

| Cache key | TTL | Layer |
|---|---|---|
| Per-player deals (`deals-v2:<player>:<mode>:<marketplace>`) | 2 h fresh, served stale ≤ 24 h + background refresh | Memory + Supabase |
| Trending players | 24 hours | Supabase |
| Underdog players | 24 hours | Supabase |
| Top opportunities | 14 days | Supabase |

## Guardrails

- Legal: `/confidentialite` + `/conditions` (Loi 25 / LCAP). Contact + location live in `lib/legal.js`; every email footer uses `senderIdentityHtml()` and promotional emails add `listUnsubscribeHeaders()` (`lib/emailFooter.js`). Account deletion (`/api/account/delete`) must cover every table holding a `user_id` or the user's email — update it when adding such a table.
- Every new Supabase table: enable RLS in the same migration (`supabase/migrations/`). Three tables shipped without RLS until 2026-09-23 and exposed user emails to the public anon key.
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
- **130point is blocked since mid-Aug 2026** (Cloudflare 403 on `back.130point.com` — success rate went from ~90 % early July to ~0 % after Aug 8, zero responses after Sep 13). The site falls back to stale cached comps or asking prices. Do NOT try to bypass the Cloudflare block (bot-detection evasion). Replacement (Carlo: budget 0 $) = our own `sold_listings` table (`lib/soldListings.js`), accumulating since 2026-09-23 — not yet wired into the cotes or the backtest.
- eBay Browse quota = 5000 calls/day (resets 07:00 UTC), shared by the whole site. `getItems` (batch of 20) returns 403 without elevated access — use `getItem` one by one. Check live usage: `GET https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_name=browse`.
- `card_price_history.card_type` holds the FULL cohort key (fingerprint). Until 2026-09-22 fallback keys `pf|…` all collapsed to `"pf"`, which made the per-player upsert fail (`ON CONFLICT DO UPDATE command cannot affect row a second time`) for ~70 % of players while the cron reported `errors: 0`.
- `/backtest` is public but unlinked + noindex: `/api/backtest` returns the full detail only when `reliable` (≥30 players, ≥10 per score tier) or to a logged-in admin (`admin_session` cookie → "Aperçu admin" banner). Price data = `card_price_history` (asking prices) fed by the `card-prices` cron on a stable panel (`getPricePanelPlayers` in `lib/priceHistory.js`: top 75 by score ∪ top 225 by points, shared with `sold-listings`).
- Alerts (`price-alerts`, `watchlist-alerts`) run every 15 min via **pg_cron + pg_net in Supabase** (job `cardmetrics-alerts`, `supabase/migrations/20260924_alerts_pg_cron.sql`) with a dedicated token: encrypted in Supabase Vault (`alerts_trigger_token`), SHA-256 in `cache_generic` key `alerts-trigger-token-v1`, checked by `lib/alertsTrigger.js`. GitHub Actions scheduling was dropped (4-5 h delays on this repo); `.github/workflows/alerts.yml` stays as a manual fallback (secret `ALERTS_TRIGGER_TOKEN`). The health report warns if < 3 `price-alerts` runs in 3 h.
- Deal Finder responses carry `scoredAt` (real compute time); the client must display it, never `Date.now()` — results can come from the 24 h cache.
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
