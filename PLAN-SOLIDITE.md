# PLAN-SOLIDITE — Sécurité et robustesse du backend

Audit défensif du site démarré le 2026-09-24. Trois volets : **sécurité** (en cours), **robustesse backend**, **ventes réelles `sold_listings`** (repoussé : la table n'a que quelques jours de données, à reprendre mi-octobre).

Légende : 🧠 réflexion / ⚡ mécanique · **Vérifié** = constaté réellement · **Non vérifié** = à confirmer en prod.

---

## Constat de l'audit (2026-09-24)

66 routes API inventoriées. Les routes utilisateur (portfolio, watchlist, alertes, notifications, préférences) filtrent **toutes** correctement par `user_id` (pas d'accès aux données d'un autre compte), et leurs mises à jour passent par une liste de champs autorisés. `analyze-listing` n'extrait que l'identifiant eBay de l'URL (pas de SSRF). Problèmes trouvés :

| # | Gravité | Problème |
|---|---|---|
| S1 | 🔴 Critique | **Next.js 15.5.18 vulnérable** — exécution de code à distance via l'optimiseur d'images quand AVIF est activé (c'est le cas dans `next.config.mjs`), + SSRF, DoS, confusion de cache. |
| S2 | 🔴 Haute | **Empoisonnement des scores** — `POST /api/score` acceptait un payload « complet » fourni par le client (fausses stats), le calculait et l'écrivait dans `player_scores` (write-through) → classements publics falsifiables pour tout joueur au score périmé. |
| S3 | 🔴 Haute | **`?refresh=1` ouvert à tous** sur `/api/deals`, `/api/deals/hottest`, `/api/opportunites/top` (~75 joueurs), `/api/auctions/ending-soon`, `/api/recrues` → n'importe qui pouvait vider le quota eBay (5000/jour partagé) et gonfler la facture DeepSeek en boucle. |
| S4 | 🟠 Moyenne | **Aucune limite de requêtes** sur les routes coûteuses (eBay/DeepSeek/courriels/écritures en base). Le seul limiteur (`score/chat`) vivait en mémoire d'une instance et se remettait à zéro en changeant de joueur. |
| S5 | 🟠 Moyenne | **`/api/cards`** : relais eBay public sans cache ni appelant (code mort), renvoyait de fausses cartes (`buildMockCards`) sans token — viole le guardrail « jamais de fausses données ». |
| S6 | 🟠 Moyenne | **Connexion admin sans anti force brute** réel (400 ms de délai seulement) ; mot de passe et HMAC comparés avec `===` (attaque temporelle). |
| S7 | 🟡 Basse | Secrets cron comparés avec `===` dans 20 routes ; `cron/weekly-picks` acceptait `Bearer undefined` si `CRON_SECRET` manquait. |
| S8 | 🟡 Basse | Aucun en-tête de sécurité HTTP (clickjacking possible, pas de HSTS…). |
| S9 | 🟡 Basse | Suppression de compte : `ilike` sur le courriel → `_`/`%` sont des jokers, `a_b@x.com` effaçait aussi l'abonnement de `axb@x.com`. |
| S10 | 🟡 Basse | `lib/portfolioValue.js` : `ilike` avec saisie utilisateur non échappée (valeur de portfolio faussée si nom « % »). |

---

## Phase A — Correctifs sécurité (10/10) ✅

- [x] **A1 ⚡ — Next.js 15.5.18 → 15.5.26** (S1) — Fait · 2026-09-24. `npm audit fix` en plus (13 vulnérabilités réglées sur 15). **Vérifié** : lint, tests, build exit 0, 0 `Attempted import error`. Reste : PostCSS embarqué dans Next (voir C4).
- [x] **A2 🧠 — Score : stats toujours hydratées côté serveur** (S2) — Fait · 2026-09-24. `/api/score` ne lit plus que `playerId` (validé `^\d{1,10}$`) ; les stats viennent toujours de l'API NHL. Le seul appelant (`spatial-player-showcase.jsx`) n'envoyait déjà que `playerId` — aucun changement visible. **Vérifié** : un payload forgé (`playerName: "HACK"`, `points: 999`) prend désormais le chemin d'hydratation NHL (avant : calcul direct sur les fausses stats) ; `playerId: "abc"` → 400.
- [x] **A3 🧠 — Limiteur de requêtes partagé** (S4) — Fait · 2026-09-24. `lib/rateLimit.js` + migration `20260924_rate_limits.sql` (table `rate_limits` avec RLS, fonction atomique `rate_limit_hit` exécutable par le service role seulement). Repli en mémoire par instance si la fonction est absente, journalisé une fois. Limites : `deals` 60/10 min/IP · `analyze-listing` 15/10 min/IP · calcul live `score` 30/10 min/IP (lectures du score stocké illimitées) · `score/chat` 10/h par joueur + 40/h global par compte/IP · `portfolio/coach` 10/h/compte · inscriptions digest/picks 5/h/IP · `track` 120/10 min/IP · `ebay-click` 60/10 min/IP · login admin 5/15 min/IP. **Vérifié** : 15 analyses OK puis 429 avec `Retry-After`, repli mémoire journalisé une seule fois. **Non vérifié** : le chemin Supabase (`rate_limit_hit`) — la migration doit d'abord être appliquée (voir « À faire par Carlo »).
- [x] **A4 🧠 — `?refresh=1` verrouillé** (S3) — Fait · 2026-09-24. Cron et admin passent toujours. Public : `hottest` 1 recalcul/mode/30 min, `deals` 1/joueur+mode+marché/15 min, `auctions` 1/15 min (tous visiteurs confondus — les autres reçoivent le cache) ; `opportunites/top` et `recrues` réservés aux opérateurs (aucune page publique ne s'en sert). Le bouton « Actualiser » de `/deals` continue de fonctionner.
- [x] **A5 ⚡ — `/api/cards` supprimée** (S5) — Fait · 2026-09-24. Morte confirmée selon le skill `audit-code-mort` (aucune référence dans le repo, scripts, smoke, docs ; aucun appel construit dynamiquement). **Vérifié** : 404, build OK.
- [x] **A6 ⚡ — Connexion admin durcie** (S6) — Fait · 2026-09-24. Comparaison en temps constant (mot de passe + HMAC dans `lib/adminAuth.js` et `middleware.js`), 5 essais/15 min/IP, timestamp invalide refusé. **Vérifié** : 5 × 401 puis 429.
- [x] **A7 ⚡ — Secrets cron centralisés** (S7) — Fait · 2026-09-24. `lib/requestAuth.js` (`isCronRequest`, `isAdminRequest`, `isOperatorRequest`, `safeEqual`) remplace les 20 copies ; `lib/alertsTrigger.js` l'utilise aussi. **Vérifié** : sans auth / mauvais secret / `Bearer undefined` → 401.
- [x] **A8 ⚡ — En-têtes de sécurité** (S8) — Fait · 2026-09-24. `next.config.mjs` : CSP limitée (`frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` — volontairement sans `script-src`, voir C3), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS 2 ans, `Permissions-Policy`. **Vérifié** : présents sur les réponses API. **Non vérifié** : rendu des pages en local (le middleware Supabase plante sans clés dans ce conteneur — déjà le cas avant). À confirmer sur la preview Vercel.
- [x] **A9 ⚡ — Suppression de compte exacte** (S9) — Fait · 2026-09-24. `.eq("email", email.toLowerCase())` au lieu de `ilike`.
- [x] **A10 ⚡ — Jokers échappés dans `portfolioValue`** (S10) — Fait · 2026-09-24.

Au passage : `score/chat` a maintenant un timeout DeepSeek de 25 s et journalise ses échecs ; `/api/deals/hottest` ne renvoie plus le message d'erreur interne au client (journalisé à la place) ; `/api/score` journalise l'échec de lecture de `player_scores` ; `track` borne la longueur de `path`/`referrer`/`ua`.

- [x] **A11 ⚡ — Middleware tolérant aux variables Supabase manquantes** — Fait · 2026-09-24. La preview Vercel de la PR renvoyait `500 MIDDLEWARE_INVOCATION_FAILED` sur TOUTES les pages : l'environnement Preview n'a pas `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, et `createServerClient` lève une erreur (bogue préexistant, pas dû à la PR : même plantage en local sans clés avant tout changement). Le middleware journalise maintenant et laisse passer. **Vérifié** : build sans clés → `/`, `/deals`, `/conditions`, `/confidentialite` en 200 (avant : 500) ; avec clés factices → 200 + en-têtes de sécurité présents.
- [ ] **B4 — Vercel : cocher « Preview »** pour `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (et idéalement les autres variables) dans Settings → Environment Variables, sinon les previews n'ont ni données ni connexion.

## Phase B — À faire par Carlo (manuel)

- [ ] **B1 — Appliquer la migration** `supabase/migrations/20260924_rate_limits.sql` dans Supabase (SQL Editor). Tant qu'elle n'est pas appliquée, les limites fonctionnent quand même, mais chaque instance Vercel compte de son côté (plus faible).
- [ ] **B2 — Vérifier la RLS de TOUTES les tables** (la plupart ont été créées dans le tableau de bord, pas par migration — impossible à vérifier depuis le code). Dans le SQL Editor :
  ```sql
  select c.relname as table, c.relrowsecurity as rls_active
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by rls_active, table;

  select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies where schemaname = 'public' order by tablename;
  ```
  Toute ligne `rls_active = false` est une fuite potentielle via la clé anon publique. Les tables utilisateur (`watchlist`, `portfolio_cards`, `price_alerts`, `notifications`, `user_preferences`) doivent avoir des policies limitées à `auth.uid() = user_id`.
- [ ] **B3 — Mot de passe admin** : il sert aussi de clé de signature des sessions. S'il est court ou réutilisé ailleurs, le remplacer par une longue phrase aléatoire dans Vercel (ça déconnecte les sessions admin existantes, c'est voulu).

## Phase C — Suite sécurité (0/5)

- [ ] **C1 🧠 ⏸ — Double confirmation des inscriptions (décision de Carlo)** — aujourd'hui, n'importe qui peut inscrire n'importe quelle adresse au digest et aux picks (`confirmed: true` d'office), et même **réabonner quelqu'un qui s'est désabonné** (`unsubscribed_at: null`). Risque LCAP (consentement) et réputation d'envoi. Correctif proposé : courriel de confirmation avec lien, abonnement actif seulement après clic ; ne jamais réactiver une adresse désabonnée sans cette confirmation. Change le parcours d'inscription → à valider avant de coder.
- [ ] **C2 ⚡ — Messages d'erreur internes renvoyés au client** — plusieurs routes renvoient `error.message` de Supabase (`watchlist`, `alerts`, `notifications`, `digest/subscribe`…). Faible gravité (révèle des noms de colonnes/contraintes). Remplacer par un message générique + `console.error`.
- [ ] **C3 🧠 — CSP complète (`script-src` avec nonces)** — protège contre l'injection de scripts (XSS). Demande des nonces dans le layout Next et de tester chaque page (framer-motion, suivi, OG). À faire avec une preview Vercel sous les yeux.
- [ ] **C4 ⚡ — PostCSS embarqué dans Next** — la dernière alerte `npm audit` (haute) ne se corrige qu'en passant à Next 16 (mise à jour majeure). Risque réel faible : PostCSS ne traite que notre propre CSS au build, jamais une entrée utilisateur. À faire avec la prochaine montée de version majeure.
- [ ] **C5 ⚡ — Longueurs des champs utilisateur** — `watchlist` (player_name, headshot_url…), `portfolio` (notes, card_type…), `alerts` : aucune borne de longueur. Ajouter des `slice()`/validations cohérentes.

## Phase D — Robustesse backend (volet 2, à venir)

- [ ] Catch silencieux restants (règle CLAUDE.md), fetch sans `AbortSignal.timeout`.
- [ ] Crons : idempotence, erreurs vraiment comptées, durée max Vercel.
- [ ] Caches : valeurs périmées non étiquetées, cache stampede.
- [ ] Quotas épuisés (eBay, DeepSeek) : dégradation propre.
- [ ] Requêtes Supabase : tie-break, `keepActivePlayers()`, N+1.
