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

## Phase 2 — Robustesse (0/4)

- [ ] **2.1 — Timeout sur les fetch NHL** — `lib/nhlPlayerLanding.js` fait des `fetch()` sans timeout vers `api-web.nhle.com`. Fix : `AbortSignal.timeout(8000)` + état d'erreur honnête. Vérifier aussi les autres `fetch` sans timeout dans `lib/`.
- [ ] **2.2 — Fin des catch silencieux dans lib/** — Tout `catch` de fallback doit logger (`console.error` préfixé, nom du module) et refléter honnêtement son état dans le payload si celui-ci a déjà des champs de statut. Chirurgical : logging seulement.
- [ ] **2.3 — Chaque cron enregistre son exécution (succès ET échec)** — Vérifier l'adoption de `recordCronRun` sur les 13 crons : le chemin échec manque le plus souvent.
- [ ] **2.4 — Route /api/health** — Agrège fraîcheur des caches clés vs seuil, derniers `cron_runs` avec flag de retard, verdict global `ok | warn | error`. Protégée par `CRON_SECRET`.

## Phase 3 — Vérification authentifiée (0/2)

- [ ] **3.1 — Login de test par mot de passe (dev uniquement)** — Chemin email+mot de passe gated par `NEXT_PUBLIC_ALLOW_TEST_LOGIN=1` (jamais en prod). `scripts/seedTestUser.mjs` crée un utilisateur de test réaliste. Prérequis externe : provider Email activé côté Supabase.
- [ ] **3.2 — Première vérification visuelle réelle des pages authentifiées** — Dashboard, portfolio, watchlist, notifications, alertes en preview desktop + 375px. Corriger les bugs évidents ; documenter le reste.

## Phase 4 — Skills & mémoire (0/6)

Format d'un skill projet : `.claude/skills/<nom>/SKILL.md` avec frontmatter YAML.

- [ ] **4.1 — Migrer pièges et garde-fous vers CLAUDE.md** — Déplacer (pas copier) de `PLAN-NEXT-LEVEL.md` vers `CLAUDE.md`, en dédupliquant.
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
