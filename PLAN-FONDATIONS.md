# PLAN-FONDATIONS.md

L'analyse des dernières sessions a révélé un pattern : le produit avance vite, mais rien ne surveille ce qui casse. Preuve concrète : le renommage « Card Scout → Card Metrics » (commit `d663fd5`, 20 juin) a cassé 2 imports ; `npm run build` affichait `Attempted import error` depuis ce jour-là, mais rien ne le surveillait, et un `catch` silencieux dans `getTopOpportunites` a servi un cache périmé en prod pendant 2 semaines sans que personne le sache (badge figé « 8 avril 2025 »).

Les 3 trous structurels, par ordre d'impact :

1. Zéro CI — aucun garde-fou automatique sur build/lint.
2. Erreurs avalées silencieusement — des `catch` qui fallback sans alerter ; la table `cron_runs` existe mais personne ne la regarde.
3. Pas de compte de test — le rendu authentifié (dashboard, portfolio, watchlist) n'a JAMAIS été vérifié visuellement (~10 tâches du plan précédent portent la mention « limite de vérification : pas d'identifiants de test »).

Et 2 pertes de connaissance :

1. Les « Pièges connus » et garde-fous vivent dans `PLAN-NEXT-LEVEL.md` — un document destiné à mourir. Ils doivent migrer vers `CLAUDE.md` et des skills projet.
2. Les procédures répétées à chaque session (vérification, audit code mort, protocole de loop) ne sont écrites nulle part de réutilisable.

Priorité produit inchangée : la crédibilité du verdict est le produit. Ce plan ne touche PAS aux features — il rend le socle fiable pour que les prochaines sessions de features soient plus sûres et plus rapides.

## 1. Protocole de loop

Obligatoire — à relire à chaque itération.

1. Trouve la première tâche non cochée dans l'ordre du document (Phase 0 → 6).
2. Lis les fichiers concernés AVANT de coder. Vérifie que la tâche est toujours pertinente (le code a pu bouger).
3. Exécute la tâche complètement (pas de moitié de tâche).
4. Vérification obligatoire avant de conclure : `npm run lint` → zéro nouvelle erreur ; `npm run build` → zéro nouvelle erreur ET zéro `Attempted import error` ; si serveur preview actif pendant un build, le redémarrer après ; si la tâche touche une route, l'appeler en direct ; `npm run smoke` quand un serveur local tourne.
5. Mets à jour le fichier : coché + date + une ligne de note. Si une tâche s'avère obsolète, coche en « re-scopé » et explique pourquoi.
6. Commit : `feat(scope):`, `fix(scope):`, `ci:`, `docs:` ou `chore:` — un commit par tâche, plan inclus. Ne pas push sans instruction.
7. STOP — une seule tâche par itération.

### Garde-fous permanents

* JAMAIS de fake data présentée comme réelle. État vide honnête ou widget masqué.
* UI 100 % français (fr-CA). IA = DeepSeek uniquement (`deepseek-chat`), jamais d'appel Anthropic.
* Ne pas modifier les poids du score (`cardScoutScoreMath.js`).
* Pas de nouvelle dépendance lourde sans nécessité. Dépendances dev-only légères (ex. `knip`) : OK si justifié.
* La CI ne doit jamais exiger de secrets pour passer au vert sur les étapes bloquantes.
* Rien de ce plan ne doit dégrader la prod : toute nouvelle route de monitoring est protégée (`CRON_SECRET`) ou n'expose aucune donnée sensible.

### Pièges connus du codebase

* `npm run build` et le serveur preview `npm run dev` partagent `.next` → un build pendant que le preview tourne corrompt son cache. Toujours redémarrer le preview après un build.
* Les caches longue durée (Supabase `cache_generic` via `persistentCache.js` : hottest 6h, auctions 30min, sold 130point 24h, opportunités 14j) masquent les changements de code en preview. Tester via `?refresh=1`.
* `grep --include="*.js"` rate les fichiers `.jsx`. Toujours inclure les deux extensions et vérifier les importeurs réels.
* Serveur dev local : port 3001 (`npm run dev -- --port 3001`), 3000 souvent occupé.
* eBay ne fournit PAS les prix vendus. Sold comps = 130point (`lib/soldPrices.js`).
* Identifiants internes `cardScout*` = intentionnels (brand visible = Card Metrics). Ne pas renommer — c'est un renommage de ce genre qui a cassé la prod en juin.
* Auth = Google OAuth uniquement via Supabase (`signInWithOAuth`). Aucun login par mot de passe aujourd'hui (la Phase 3 en ajoute un pour les tests).

### Infra existante à réutiliser

* `lib/cronLog.js` → `recordCronRun(cronName, { status, rowsAffected, durationMs, detail })`, best-effort, table `cron_runs`.
* `lib/notifications.js` → `pushNotification({ userId, type, title, body, link, metadata })`, table `notifications`.
* Emails = Resend (`RESEND_API_KEY`, `RESEND_FROM`) — pattern dans `app/api/cron/daily-digest/route.js`.
* `lib/persistentCache.js` → cache Supabase `cache_generic`.
* `scripts/smoke.mjs` → 12 routes, `SMOKE_BASE_URL` (défaut `http://localhost:3001`), exit code ≠ 0 si échec.
* Les payloads publics exposent déjà `fetchedAt` (`/api/deals/hottest`, `/api/auctions/ending-soon`, `/api/trending`) — matière première de la sentinelle de fraîcheur (tâche 5.1).
* 13 crons Vercel dans `vercel.json` (voir ce fichier pour la liste et les cadences).

## Phase 0 — Baseline (1/1 · une itération)

- [x] **0.1 — État des lieux vérifiable** — Fait · 5 juillet. `npm ci` propre (660 paquets). `npm run lint` : zéro erreur, 5 warnings pré-existants sans rapport avec ce plan. `npm run build` sans aucun `.env.local` : build réussi, zéro `Attempted import error`. Serveur dev relancé avec valeurs factices Supabase. `npm run smoke` : 8/12 (les 4 échecs viennent d'une politique réseau sortant restreinte dans cette session, pas d'une régression).

## Phase 1 — CI GitHub Actions (3/3 · priorité #1)

Le repo n'a aucun workflow. Un simple build en CI aurait attrapé le bug des imports de juin le jour même au lieu de 2 semaines plus tard.

- [x] **1.1 — Workflow CI : lint + build sur chaque push et PR** — Fait · 5 juillet. `.github/workflows/ci.yml` créé : Node 20, `npm ci`, `npm run lint`, `npm run build` (avec `tee build.log`), étape finale qui grep `Attempted import error` dans le log et fait échouer le job si trouvé. Aucun secret requis (build passe avec l'environnement nu, confirmé en local). Vérifié en local avant commit : lint zéro erreur (5 warnings pré-existants), build réussi, zéro `Attempted import error`.
- [x] **1.2 — Smoke test quotidien contre la prod** — Fait · 5 juillet. `.github/workflows/smoke-prod.yml` créé : `schedule` (12h UTC quotidien) + `workflow_dispatch`, `SMOKE_BASE_URL=https://cardmetrics.io`, `npm run smoke`. Aucune route authentifiée ni `?refresh=1` (les 12 routes de `scripts/smoke.mjs` sont toutes publiques). Limite de vérification : réseau sortant restreint dans cette session (confirmé tâche 0.1) — impossible d'exécuter ce test contre la vraie prod ici ; le workflow tournera en environnement GitHub normal.
- [x] **1.3 — Documenter la CI dans CLAUDE.md** — Fait · 5 juillet. Section « CI » ajoutée dans `CLAUDE.md` (entre Commands et Environment Variables) : les 2 workflows, la règle build-sans-secrets, la consigne de vérifier la CI verte après un push, et la note que la protection de branche `main` est une action manuelle dans les settings GitHub.

## Phase 2 — Robustesse (4/4)

- [x] **2.1 — Timeout sur les fetch NHL** — Fait · 5 juillet. Le grep a montré que le problème n'était pas limité à `nhlPlayerLanding.js` : **aucun** des ~25 `fetch()` externes dans `lib/` n'avait de timeout. Ajouté `signal: AbortSignal.timeout(...)` partout (8s pour NHL/eBay/Wikipedia/130point/BoC, 30s pour les appels DeepSeek qui incluent parfois du "thinking"). Là où le `catch` avalait l'erreur sans trace (`nhlPlayerLanding`, `catalystDetector`, `analyzeListing`, `ebayServer`, `dealFinder.fetchPlayerContextForDeals`, `auctionDeals`, `fxRate`, `socialAttention`, `soldPrices`, `teamContext`), ajouté un `console.error` préfixé par module — chevauche une partie de la tâche 2.2. Limite de vérification : impossible de tester ces routes en direct dans cette session (port 3001 occupé par un autre chat, réseau sortant restreint vers les APIs NHL/eBay réelles) — vérifié uniquement via `npm run lint` (zéro nouvelle erreur) et `npm run build` (succès, zéro `Attempted import error`).
- [x] **2.2 — Fin des catch silencieux dans lib/** — Fait · 5 juillet. Le catch racine de `getTopOpportunites` (le bug exact de juin) loggue maintenant via `console.error` avant de retomber sur le cache périmé — le payload reflétait déjà `stale`/`error` honnêtement, seul le log serveur manquait. Même traitement pour les autres lectures cache silencieuses de `opportunitesTop.js` (`readOpportunitesCacheFromSupabase`, `readStaleOpportunitesCache`, `buildTopOpportunitesFromDb`), `persistentCache.js` (lecture Supabase — le disk-miss final reste silencieux, c'est un cache-miss normal pas une erreur), et `cronLog.js` (`recordCronRun` : si le logging cron lui-même échoue silencieusement, `cron_runs` devient un angle mort invisible). Laissé tel quel : `useRecentPlayers.js` (localStorage client, pas un risque d'incident silencieux serveur) et les catch JSON.parse triviaux (échec de parsing attendu, pas un masquage d'incident). Vérifié : lint zéro nouvelle erreur, build réussi zéro `Attempted import error`.
- [x] **2.3 — Chaque cron enregistre son exécution (succès ET échec)** — Fait · 5 juillet. Audit des 13 routes cron (`vercel.json`) : seuls 4 (`card-prices`, `snapshot-scores`, `enrich-scores`, `welcome-emails`) appelaient `recordCronRun`, et même ceux-là ne couvraient que le chemin succès + un ou deux retours anticipés — aucun n'avait de `try/catch` global pour capter une exception non gérée. Les 9 autres (`trending`, `hottest`, `recompute-scores`, `opportunites`, `price-alerts`, `watchlist-alerts`, `weekly-picks`, `card-prices` avait un enregistrement partiel, `auctions`, `daily-digest`) n'enregistraient RIEN. Ajouté `recordCronRun` (succès + tous les retours anticipés + catch global) sur les 13 routes. Cas notable : `/api/cron/opportunites` — le cron exact du bug de prod de juin — n'avait AUCUN enregistrement ; il logge maintenant `error` quand `getTopOpportunites` retombe sur du stale. Vérifié : lint zéro nouvelle erreur, build réussi zéro `Attempted import error`. Limite : impossible d'invoquer ces routes en direct (secret `CRON_SECRET` + réseau externe indisponibles dans cette session).
- [x] **2.4 — Route /api/health** — Fait · 5 juillet. Nouvelle route `app/api/health/route.js`, protégée par `CRON_SECRET` (même contrat que `/api/admin/health` déjà existant, qui reste en place pour compat). Agrège : (1) dernier run de chacun des 13 crons via `cron_runs`, avec seuil de fraîcheur attendu par cron dérivé de `vercel.json` ; (2) fraîcheur de 3 caches globaux à un seul point d'entrée — hottest (6h), enchères (30min), opportunités (14j) via 2 nouveaux lecteurs "peek-only" sans coût réseau (`readAuctionCacheOnly` dans `lib/auctionDeals.js`, `readOpportunitesCacheOnly` dans `lib/opportunitesTop.js`, `readHottestCacheOnly` existait déjà) ; le cache sold-prices (130point) est explicitement exclu — il est keyé par requête de recherche, pas de point de fraîcheur global à surveiller. Verdict 3 états : `error` (cron en erreur, cron jamais exécuté depuis l'instrumentation, ou cache global manquant), `warn` (cron ou cache périmé au-delà de son TTL), sinon `ok`. Limite connue : juste après ce déploiement, les crons peu fréquents (hebdo/bimensuel) afficheront `never_ran` jusqu'à leur prochaine exécution planifiée — faux positif transitoire, pas un vrai problème ; la tâche 5.1 (cron sentinelle + email) devra en tenir compte. Vérifié : lint zéro nouvelle erreur, build réussi (route compilée, zéro `Attempted import error`).

## Phase 3 — Vérification authentifiée (2/2)

- [x] **3.1 — Login de test par mot de passe (dev uniquement)** — Fait · 5 juillet. `LoginForm.js` ajoute un formulaire email+mot de passe (`supabase.auth.signInWithPassword`), rendu seulement si `NEXT_PUBLIC_ALLOW_TEST_LOGIN === "1"` — absent par défaut, donc invisible en prod tant que la variable n'est pas définie sur Vercel. `scripts/seedTestUser.mjs` (nouveau, déjà présent non commité avant ce plan — repris et complété) : crée/réinitialise l'utilisateur `test-agent@cardmetrics.io` via l'API admin Supabase, seed 2 watchlist, 2 cartes portfolio (achat direct + pack-pull), 1 alerte prix. Ajouté `npm run seed:test-user`. Prérequis externe non actionnable depuis cette session : le provider Email doit être activé côté Supabase Auth (Authentication → Providers) et la confirmation d'email désactivée — documenté en commentaire dans le script. Vérifié : lint zéro nouvelle erreur, build réussi zéro `Attempted import error`. Non vérifié : connexion réelle (nécessite le provider Supabase activé + accès réseau, indisponibles ici) — voir tâche 3.2.
- [x] **3.2 — Première vérification visuelle réelle des pages authentifiées** — Fait · 5 juillet. Confirmé avec l'utilisateur que `.env.local` pointe vers le Supabase de **production** (pas de projet dev/staging séparé) avant de lancer le seed — autorisation obtenue. `npm run seed:test-user` a créé `test-agent@cardmetrics.io` + 2 watchlist + 2 cartes portfolio + 1 alerte. `NEXT_PUBLIC_ALLOW_TEST_LOGIN=1` ajouté à `.env.local` (non commité, `.env*` est gitignored). Connexion réussie via le formulaire de test → redirection `/dashboard`. Vérifié en preview (desktop + mobile 375px) : `/dashboard` (KPIs corrects : $100 portfolio, score moyen 7.0, 1 alerte active), `/portfolio` (2 cartes, santé du portfolio, formatage $ correct), `/watchlist` (2 joueurs), `/alertes` (1 alerte active bien affichée), `/notifications` (état vide honnête, pas de fake data). Aucun débordement horizontal mobile, aucune régression visible. Un seul problème trouvé, hors scope de cette tâche : `RecentSearches` déclenche un warning React "each child in a list should have a unique key prop" sur `/dashboard` — documenté ci-dessous, pas corrigé ici (bug pré-existant, pas introduit par ce plan).

## Phase 4 — Skills & mémoire (1/6)

Format d'un skill projet : `.claude/skills/<nom>/SKILL.md` avec frontmatter YAML.

- [x] **4.1 — Migrer pièges et garde-fous vers CLAUDE.md** — Fait · 5 juillet. Déplacé (pas copié) les 3 sections de `PLAN-NEXT-LEVEL.md` (Garde-fous permanents, Pièges connus, Design system) vers 3 nouvelles sections dans `CLAUDE.md` : « Guardrails », « Known Pitfalls », « Existing Design Tokens ». Dédupliqué avec le contenu déjà présent (ex. règle fake-data, DeepSeek-only, poids du score déjà couverts en partie ; ajouté la règle catch-silencieux issue de la tâche 2.2 et la note sur les timeouts de la tâche 2.1). `PLAN-NEXT-LEVEL.md` conserve un pointeur court vers `CLAUDE.md` à la place du contenu déplacé. Vérifié : lint zéro nouvelle erreur (changement doc uniquement, pas de rebuild nécessaire).
- [ ] **4.2 — Skill verify-cardmetrics** — Procédure de vérification complète codifiée.
- [ ] **4.3 — Skill loop-iteration** — Protocole de loop généralisé pour futurs `PLAN-*.md`.
- [ ] **4.4 — Skill nouvelle-page** — Tokens/primitives réutilisables, règles dures, rappel skill design.
- [ ] **4.5 — Skill audit-code-mort** — Méthode éprouvée en session pour ne jamais déclarer un fichier mort à tort.
- [ ] **4.6 — Skill toucher-au-score** — Zone la plus sensible : `SCORE_WEIGHTS`, server-only vs client, sous-scores avancés.

## Phase 5 — Automations (0/3)

- [ ] **5.1 — Cron sentinelle : health-check quotidien avec alerte email** — `GET /api/cron/health-check` réutilise `/api/health` ; email Resend à `ADMIN_ALERT_EMAIL` si `warn`/`error`. Anti-spam.
- [ ] **5.2 — Hook SessionStart cross-platform** — Remplacer le hook Windows-only par un script Node portable.
- [ ] **5.3 — Détection de code mort outillée (knip)** — Ajouter `knip` en devDependency, première cartographie sans suppression.

## Phase 6 — Optionnel (0/3)

- [ ] **6.1 — Ménage du code mort cartographié (zone app/home/)** — Une zone par itération, méthode du skill `audit-code-mort`.
- [ ] **6.2 — Icônes PWA PNG** — Générer 192×192 et 512×512, référencer dans le manifest.
- [ ] **6.3 — Fix des bugs restants de PLAN-NEXT-LEVEL.md** — Une correction par itération.

## ⚠ Bugs découverts en cours de route

Hors scope de la tâche qui les a trouvés — à corriger séparément.

* `.env.example` n'existe pas dans le repo, alors que `CLAUDE.md` dit explicitement de le copier vers `.env.local`. Découvert tâche 0.1 (5 juillet). Impact : friction d'onboarding. Suggestion : créer `.env.example` avec toutes les clés documentées (valeurs vides/factices). Bon candidat pour une itération courte des phases 5/6.
* `.env.local` contient `ANTHROPIC_API_KEY` et `RAPIDAPI_KEY` — ni l'un ni l'autre n'est documenté dans `CLAUDE.md` ni référencé dans le code (`grep` négatif sur `lib/` et `app/`). Découvert tâche 3.2 (5 juillet). `ANTHROPIC_API_KEY` en particulier est surprenant vu la règle « IA = DeepSeek uniquement, jamais d'appel Anthropic » — a priori une clé orpheline plutôt qu'un vrai appel caché, mais mérite une vérification rapide et un nettoyage de `.env.local` + mise à jour de la doc env.
* `RecentSearches` (rendu sur `/dashboard`) déclenche un warning React « each child in a list should have a unique key prop ». Découvert tâche 3.2 (5 juillet) en connexion de test. Pas de crash, juste un warning console — bon candidat pour une itération courte.
