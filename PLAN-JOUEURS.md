# PLAN-JOUEURS.md — Base de données joueurs complète + page annuaire

## Diagnostic (5 juillet 2026)

Trois problèmes distincts découverts en investiguant « Leo Carlsson a 7.8 mais n'apparaît pas dans le top opportunités » :

1. **Deux sources de vérité qui divergent.** La table `player_scores` contient Carlsson à **7.30** (calculé par le cron), mais sa page `/player/[id]` affiche **7.8** — parce que `/api/score` recalcule en live quand le score stocké est périmé (`STALE_AFTER_MS` = 10 jours), avec des données eBay/DeepSeek plus fraîches, **sans jamais réécrire le résultat dans la DB**. Le top opportunités lit la DB → il voit 7.30, pas 7.8.
2. **Cutoff arbitraire.** Carlsson est à 7.30 = exactement le score de la 10ᵉ place. Le `ORDER BY score DESC LIMIT 10` sans tie-break le fait perdre l'égalité de façon non déterministe.
3. **Couverture partielle.** `player_scores` n'a que **161 lignes**. Le cron `recompute-scores` ne traite que le **top 75 par points** à chaque passage (`PROCESS_LIMIT = 75` dans `lib/playerScores.js`). Un joueur hors du top 75 en points n'est jamais scoré, peu importe son potentiel carte. Et il n'existe **aucune page pour browser les joueurs** — la seule entrée est la recherche.

État actuel du schéma `player_scores` : `player_id (text, PK)`, `player_name`, `team`, `headshot_url`, `score (numeric)`, `tier`, `points (int)`, `games_played (int)`, `computed_at (timestamptz)`, `data (jsonb)`, `sport (text)`.

Objectif du chantier : une **source unique de vérité** pour tous les joueurs NHL de la saison (annuaire complet), des **scores cohérents** entre pages, et une **page `/joueurs` browsable** pour les visiteurs.

## 1. Protocole de loop

Obligatoire — à relire à chaque itération.

1. Trouve la première tâche non cochée dans l'ordre du document (Phase 0 → 4).
2. Lis les fichiers concernés AVANT de coder. Vérifie que la tâche est toujours pertinente (le code a pu bouger).
3. Exécute la tâche complètement (pas de moitié de tâche).
4. Vérification obligatoire avant de conclure : `npm run lint` → zéro nouvelle erreur ; `npm run build` → zéro nouvelle erreur ET zéro `Attempted import error` ; si serveur preview actif pendant un build, le redémarrer après ; si la tâche touche une route, l'appeler en direct (port 3001).
5. Mets à jour le fichier : coché + date + une ligne de note. Si une tâche s'avère obsolète, coche en « re-scopé » et explique pourquoi.
6. Commit : `feat(scope):`, `fix(scope):`, `db:`, `docs:` ou `chore:` — un commit par tâche, plan inclus. Ne pas push sans instruction.
7. STOP — une seule tâche par itération.

### Garde-fous permanents

* JAMAIS de fake data présentée comme réelle. État vide honnête ou widget masqué.
* UI 100 % français (fr-CA). IA = DeepSeek uniquement (`deepseek-chat`), jamais d'appel Anthropic.
* Ne pas modifier les poids du score (`cardScoutScoreMath.js`).
* Toute nouvelle table Supabase reçoit **immédiatement** sa policy RLS `service_role_full_access` — la table `cache_opportunites` avec RLS activé mais zéro policy a bloqué silencieusement toutes les écritures pendant des jours (bug du 5 juillet).
* Tout nouveau cron : `recordCronRun` sur succès ET échec, `AbortSignal.timeout()` sur les fetch externes, entrée dans le trigger admin (handler DIRECT, pas fetch HTTP — voir pièges).
* Pas de nouvelle dépendance lourde.

### Pièges connus du codebase (spécifiques à ce chantier)

* **Trigger admin = import direct, jamais fetch HTTP.** Le fetch interne via `VERCEL_URL` a pointé vers un ancien deployment (retournait du HTML) et via le custom domain Vercel stripe l'`Authorization` header. Tout nouveau cron déclenchable ajoute un handler dans `DIRECT_HANDLERS` de `app/api/admin/trigger/[agent]/route.js`.
* **API NHL stats** : `seasonId`/`gameTypeId` en query directe → 500 fréquents ; utiliser `cayenneExp` (voir `buildSkaterSummaryUrl` dans `lib/opportunitesTop.js`). Pagination par 100 (`fetchAllSummaryForSeason` / `fetchAllBiosForSeason` existent déjà — réutiliser, ne pas dupliquer).
* **maxDuration Vercel = 300 s** (plan Hobby). Scorer ~600 joueurs avec eBay+DeepSeek par joueur est impossible en un run — le plan découpe math-only (rapide) vs score complet (top 100).
* **`.next` partagé** entre build et preview — redémarrer le preview après un build.
* **Caches persistants** masquent le code frais — `?refresh=1` quand supporté.
* Cron `sync-players` et page `/joueurs` : les gardiens (`positionCode === "G"`) sont exclus du scoring actuel — les inclure dans l'annuaire mais sans score (état honnête « non scoré »), pas de score inventé.

---

## Phase 0 — Cohérence des scores (les bugs visibles d'abord)

- [ ] **0.1 Write-through du recalcul live.** Dans `/api/score` (`app/api/score/route.js`), quand le score stocké est périmé et qu'un recalcul live réussit, réécrire le résultat dans `player_scores` (réutiliser `upsertScoreRows` ou équivalent exporté de `lib/playerScores.js`). Résultat : la page joueur et le top opportunités lisent le même chiffre. Vérifier avec Carlsson : après visite de sa page, `SELECT score FROM player_scores WHERE player_name ILIKE '%carlsson%'` doit refléter le score affiché.
- [ ] **0.2 Tie-break déterministe.** Partout où on classe par score (`buildTopOpportunitesFromDb` dans `lib/opportunitesTop.js`, et tout `ORDER BY score` dans les API), ajouter un tie-break stable : `score DESC, points DESC, player_id ASC`. Un joueur à égalité ne doit plus disparaître/apparaître au hasard.
- [ ] **0.3 Règle « DB d'abord » documentée.** Ajouter dans `CLAUDE.md` (section Architecture) : `player_scores` est LA source de vérité des scores ; tout recalcul live doit écrire en retour (write-through) ; interdiction d'afficher un score calculé qui n'est pas persisté.

## Phase 1 — Annuaire complet : table `players`

- [ ] **1.1 Migration Supabase.** Table `players` : `player_id text PK`, `full_name text`, `first_name text`, `last_name text`, `team_abbrev text`, `position_code text`, `birth_date date`, `age int` (calculé au sync), `games_played int`, `goals int`, `assists int`, `points int`, `headshot_url text`, `sport text default 'NHL'`, `season_id int`, `is_active boolean default true`, `synced_at timestamptz`. Index sur `team_abbrev`, `position_code`, `points DESC`, et index trigram ou `lower(full_name)` pour la recherche. **Policy RLS `service_role_full_access` dans la MÊME migration** + policy `SELECT` pour `anon` (l'annuaire est public en lecture).
- [ ] **1.2 `lib/playerDirectory.js`.** Fonction `syncAllPlayers()` : réutilise `fetchAllSummaryForSeason` + `fetchAllBiosForSeason` (exportées par `lib/opportunitesTop.js`), fusionne summary+bios par `playerId`, calcule l'âge, upsert par batch de 100 dans `players` (`onConflict: "player_id"`). Inclut TOUS les patineurs de la saison (pas de filtre points) ; gardiens inclus si présents dans les données, sinon patineurs seulement pour l'instant (noter le choix). Retourne `{ synced, errors }`. Logs préfixés `[playerDirectory]`, timeouts sur tous les fetch (déjà dans `fetchNhlStatsJson`).
- [ ] **1.3 Cron `sync-players`.** `app/api/cron/sync-players/route.js` (auth `CRON_SECRET`, `recordCronRun` succès+échec, `maxDuration 300`). Schedule hebdomadaire dans `vercel.json` (les crons Hobby sont limités — vérifier le quota ; sinon le déclencher depuis un cron existant ou en manuel). Ajouter le handler direct dans `DIRECT_HANDLERS` du trigger admin + la carte agent dans le panel admin.
- [ ] **1.4 Backfill initial + sentinelle.** Lancer le sync une fois (trigger admin en prod, ou script local `scripts/syncPlayers.mjs` réutilisant la lib). Vérifier `SELECT count(*) FROM players` ≥ 600. Ajouter dans `/api/health` une sentinelle : `players_count < 500` ou `synced_at > 14 jours` → verdict `warn`.

## Phase 2 — Scores pour tout le monde (stratégie deux vitesses)

- [ ] **2.1 Score math pour le pool étendu.** Dans `lib/playerScores.js` : nouveau mode dans `recomputeAllScores` — pour les joueurs hors top 100 par points mais avec `gamesPlayed ≥ 10`, calculer le **score math seul** (`computeFactorScores` sans eBay ni DeepSeek — même approche que `scoreCandidateWithCardMetrics` dans `opportunitesTop.js`) et l'upserter avec `data.scoreMode = "math"`. Le top 100 par points garde le score complet (`data.scoreMode = "full"`). Découpage en batches pour rester sous 300 s — si nécessaire, paramètre `?offset=` pour des runs rotatifs.
- [ ] **2.2 UI honnête sur les scores math-only.** Sur `/player/[id]` et partout où le score s'affiche : si `scoreMode === "math"`, ne pas afficher de verdict/narratif DeepSeek inventé — badge « Score de base » ou équivalent français sobre. Le top opportunités ne sélectionne QUE des `scoreMode = "full"` (le narratif exige les données complètes).
- [ ] **2.3 Vérification top opportunités.** Après 2.1 : déclencher `recompute-scores` puis `opportunites` via le panel admin. Vérifier que le top 10 est stable, cohérent avec les pages joueur, et que Carlsson y figure si son score le justifie (tie-break de 0.2 appliqué).

## Phase 3 — Page `/joueurs` (annuaire browsable public)

- [ ] **3.1 Design system d'abord.** `python .claude/skills/ui-ux-pro-max/scripts/search.py "sports player directory data table" --design-system -p "Card Metrics"` — obligatoire avant tout code UI. Réutiliser les tokens existants (`--ice`, `--void`, `cn-card`, `.wow-rise` de `app/components/wow/wow.css`).
- [ ] **3.2 API `GET /api/joueurs`.** Params : `search` (nom, insensible casse/accents), `team`, `position`, `sort` (`score` | `points` | `name` | `age`), `order`, `page`/`limit` (défaut 25, max 100). Lit `players` LEFT JOIN `player_scores` (le score peut être absent → `null`, jamais inventé). Tri par défaut : score DESC avec tie-break de 0.2, les non-scorés en fin. Réponse paginée `{ players, total, page, pages }`. Cache court (memory 5 min) — pas de Supabase cache, la table EST la source.
- [ ] **3.3 Page `/joueurs`.** Server component + client pour filtres/recherche. Tableau responsive (grille de cartes sous 768 px, testé à 375 px) : photo, nom, équipe, position, âge, PJ/B/A/Pts, score Card Metrics (badge tier coloré, tiret honnête si non scoré). Recherche débouncée, filtres équipe/position, tri cliquable, pagination. Chaque ligne → `/player/[id]`. 100 % français, touch targets ≥ 44 px, `prefers-reduced-motion` respecté.
- [ ] **3.4 Navigation + SEO.** Entrée « Joueurs » dans `AppNav.js` (vérifier la limite bottom-nav ≤ 5 sur mobile — si dépassée, décider quoi regrouper et le noter). Ajouter `/joueurs` à `app/sitemap.js`, metadata français (title, description).
- [ ] **3.5 Vérification preview complète.** Serveur port 3001 : recherche « carlsson » → le trouve ; filtre équipe ; tri par score ; pagination ; mobile 375 px ; aucun horizontal scroll ; console sans erreur. Screenshot de preuve.

## Phase 4 — Garde-fous et intégration

- [ ] **4.1 Smoke test.** Ajouter `/joueurs` et `/api/joueurs?limit=5` aux 12 routes de `scripts/smoke.mjs` (public, sans auth, sans `?refresh=1`).
- [ ] **4.2 CLAUDE.md à jour.** Section Architecture : table `players`, cron `sync-players`, page `/joueurs`, API `/api/joueurs`, la règle deux-vitesses (`scoreMode: full | math`), et la règle write-through de 0.3 si pas déjà fait.
- [ ] **4.3 CI verte + prod vérifiée.** Push, CI verte, puis en prod : `/joueurs` charge, le panel admin déclenche `sync-players` avec succès, `/api/health` inclut la sentinelle players. Vérifier `cron_runs` pour le premier run prod.
