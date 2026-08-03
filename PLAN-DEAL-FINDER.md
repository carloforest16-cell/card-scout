# PLAN-DEAL-FINDER.md — Finalisation de la section Deal Finder

> **Objectif** : amener `/deals` à l'état « fini » — chaque chiffre affiché est défendable,
> et l'outil reste UTILE même quand la donnée manque.
> **Date de l'audit** : 2026-07-30, mesuré en PRODUCTION sur 5 joueurs réels.
> **Exécution** : une tâche à la fois via la skill `loop-iteration`.
> **Modèle suggéré** : 🧠 = Opus (cotes/scoring/stratégie), ⚡ = Sonnet (UI/CSS/mécanique).
>
> **Règle d'or** (guardrail CLAUDE.md) : jamais une donnée fausse présentée comme vraie.
> Corollaire appris à l'audit : **« pas de donnée » est un état produit normal, pas un échec
> à masquer.**
>
> **Dépendances** — une version antérieure de ce plan affirmait « rien d'autre n'a de sens
> avant 1.1 ». C'était FAUX. La doctrine 1.1 ne bloque que la tâche 1.2, qui en est la mise en
> œuvre ; elle influence la présentation de 1.3, pas son contenu. Les phases A à D ci-dessous
> sont toutes exécutables sans attendre cette décision — d'où leur ordre dans ce document.

---

## Mesures de l'audit (prod, 2026-07-30)

| Joueur | eBay → affichées | Score joueur → plafond | Score max annonce | Cote FIABLE (≥4 comps) | Badge | Verdicts |
|---|---|---|---|---|---|---|
| Connor McDavid | 200 → 27 | 6,1 → 7,6 | 6,2 | 5/27 (**19 %**) | ✗ | 22 « Chercher mieux », 5 « Passer » |
| Ivan Demidov | 200 → 80 | 7,1 → 8,6 | 7,6 | 30/80 (**38 %**) | ✓ | 8 Acheter, 54 Chercher, 18 Passer |
| Cole Caufield | 200 → 73 | 6,7 → 8,2 | 7,2 | 6/73 (**8 %**) | ✗ | 1 Acheter, 58 Chercher, 14 Passer |
| Macklin Celebrini | 200 → 55 | 8,2 → 9,7 | 8,5 | 22/55 (**40 %**) | ✓ | 2 Acheter, 34 Chercher, 19 Passer |
| Nick Suzuki | 200 → 80 | 6,4 → 7,9 | 6,9 | 7/80 (**9 %**) | ✗ | 65 Chercher, 15 Passer |

**Moyennes** : cote fiable **23 %** des annonces affichées · 137/200 écartées au filtrage ·
port inconnu 2 par recherche · badge présent chez **2/5** joueurs.

---

## Ce qui marche bien ✅

| Sujet | État |
|---|---|
| **Filtrage du junk** | 137/200 annonces écartées (packs, lots, reprints, customs, art). Harnais de non-régression en CI (`scripts/test-cohorts.mjs`, 23 cas). Solide. |
| **Clés de cohorte** | Vérifiées correctes et distinctes à l'audit (`outburst-outburst` ≠ `young-guns-outburst`). |
| **Coût total** | Port résolu via l'API *item detail* ; ~2 annonces au port inconnu par recherche, signalées en ambre. `shippingCad` a 3 états explicites dans les 4 modules. |
| **Cote unique** | `/deals` et `/analyse` s'accordent (une seule construction de requête). |
| **Garde-fou anti-LLM** | `guardCardTypeAgainstTarget` rattrape les erreurs de DeepSeek de façon déterministe, et les journalise. |
| **Rang serveur** | `assignDealRanks` : badge stable, indépendant des filtres client, exige cote exacte + coût total connu. |
| **États vides honnêtes** | « Cote indisponible », « aucune alternative moins chère » — jamais de chiffre inventé. |

---

## Diagnostic — ce qui ne marche pas ❌

| # | Symptôme mesuré | Cause racine | Gravité |
|---|---|---|---|
| **D1** | **77 % des annonces n'ont AUCUNE cote fiable.** Caufield 8 %, Suzuki 9 %, McDavid 19 %. | **Les ventes n'existent pas.** Vérifié sur 130point : `"demidov 2025-26 extended outburst"` → **0 vente**. Les cartes 2025-26 peu liquides n'ont pas d'historique. Ce n'est PAS un bug de requête — élargir ramène les ventes d'une AUTRE carte (13 Young Guns sur 15), que le garde-fou rejette à juste titre. | 🔴 Bloquant produit |
| **D2** | **Verdict presque toujours « Chercher mieux »** : McDavid 22/27, Suzuki 65/80. | Conséquence de D1 : sans cote, `guardBuyWithoutFairValue` interdit « Acheter » (à raison). Le verdict devient du remplissage. | 🔴 Utilité |
| **D3** | **Badge absent chez 3/5 joueurs.** | `assignDealRanks` exige score ≥ 7,5 ; `applyPlayerQualityCap` plafonne à `scoreJoueur + 1,5`. Un joueur coté < 6,0 ne peut MATHÉMATIQUEMENT jamais avoir de badge. Les deux constantes n'ont jamais été calibrées l'une contre l'autre. | 🟠 Important |
| **D4** | **McDavid coté 6,1**, sous Celebrini (8,2). | Algo v7.1 pondéré jeunesse + upside. Défendable pour un horizon d'investissement, mais mine la confiance. Problème de **communication**, pas de calcul. | 🟠 Important |
| **D5** | **DeepSeek se trompe massivement sur les comparables** : 6/6, 24/25, 26/27 rejetés par le garde-fou. | Le prompt de `compMatcher.js` est correct (critère 3 : « même set/produit »). Le modèle viole sa consigne. Le garde-fou couvre `cardType`, rien ne couvre le SET. | 🟠 Important |
| **D6** | **27 annonces pour McDavid** contre 80 pour Demidov. | À investiguer : probablement le mode `raw` par défaut qui écarte ses cartes gradées. | 🟡 À confirmer |
| **D7** | **130point = point de défaillance unique.** `HTTP 504` observé pendant l'audit. | Une seule source de ventes, scrapée, sans repli. Si elle tombe, toutes les cotes disparaissent. | 🟡 Robustesse |
| **D8** | `cardmetrics.io` renvoie **308** vers `www.cardmetrics.io`. | Casse les clients API qui ne suivent pas les redirections. | 🟢 Mineur |
| **D9** | CI : `checkout@v4` / `setup-node@v4` forcés sur Node 24. | Avertissement GitHub, non bloquant. | 🟢 Mineur |

---

## Phase A — Correctifs immédiats (2/2) ✅

- [x] **4.2 ⚡ — Bump des actions CI** — Fait · 2026-07-30. `actions/checkout@v4` → `@v5` et `actions/setup-node@v4` → `@v5` dans `ci.yml` et `smoke-prod.yml` (4 occurrences). **Limite de vérification** : le résultat réel d'un workflow GitHub Actions ne peut pas être obtenu sans push — non vérifié à ce stade, à confirmer au prochain push. Aucune validation YAML locale possible non plus (module `yaml` absent) ; le diff se limite à quatre chaînes de version, revu manuellement.
- [x] **4.1 ⚡ — Smoke test et domaine canonique** — Fait · 2026-07-30. **Implémentation divergente, assumée** : la tâche demandait de basculer le défaut de `smoke.mjs` sur la PROD. En lisant le script, c'est le mauvais correctif — il sert de filet à la loop de dev, et un défaut « prod » ferait passer une vérification locale pour une vérification de production, exactement l'inverse du problème à régler. La vraie cause du faux « 18/18 en prod » : la cible n'était annoncée qu'en TÊTE de sortie, ligne tronquée par un `tail`. Retenu à la place : (1) la cible figure désormais dans la LIGNE DE RÉSUMÉ, avec un `⚠ CIBLE LOCALE, PAS LA PRODUCTION` explicite quand elle est locale ; (2) nouveau `npm run smoke:prod` via un drapeau `--prod` — pas de variable d'environnement (non portable sous Windows) et pas de dépendance `cross-env` (guardrail) ; (3) domaine canonique fixé à `www` dans le script et dans `smoke-prod.yml`, qui ciblait la forme nue redirigée en 308 (B-A2). **Vérifié réellement** : `npm run smoke:prod` → `18/18 routes OK — https://www.cardmetrics.io` ; `npm run smoke` serveur éteint → `0/18 — http://localhost:3001 ⚠ CIBLE LOCALE`. Le choix du domaine canonique côté DNS/Vercel reste manuel, non fait (D8 partiellement traité : le code ne dépend plus de la redirection, mais la redirection existe toujours).

## Phase B — Fiabiliser les comparables (3/3) ✅

- [x] **3.1 🧠 — Étendre le garde-fou au SET** — Fait · 2026-07-30. `detectSeriesTag()` ajouté à `cardNumberExtractor.js` (`series-1` / `series-2` / `extended` / null), exposé par `extractPartialFeatures` et comparé dans `guardCardTypeAgainstTarget` ET dans le filtre regex de repli, avec la règle inchangée : un `null` ne tranche jamais. Détecteur SÉPARÉ de `SET_NAMES`, qui exige `\bExtended\s+Series\b` alors que les vendeurs écrivent « Upper Deck Extended » tout court — c'était précisément le trou. Cache `v5` → `v6`. Harnais : 5 cas ajoutés (`kind: "comp-reject"`), dont **deux contre-épreuves** vérifiant que le garde-fou n'est pas trop zélé (« S1 » ≡ « Series 1 » conservé, vente au titre pauvre conservée). **Vérifié réellement** : `npm run test:cohorts` → 28 OK / 0 échec réel ; lint propre ; build exit 0 ; en preview sur Demidov, cache invalidé, les Outburst Extended tombent à 2 comps et n'émettent plus aucun signal. **Coût mesuré et assumé** : la cote fiable de Demidov passe de **38 % à 28 %** des annonces — 8 annonces perdent leur cote de confiance. Le garde-fou aggrave donc D1 (couverture) pour corriger D5 (justesse). C'est le bon sens du compromis (guardrail : jamais un chiffre faux), mais ça rend la doctrine 1.1 plus urgente, pas moins.
- [x] **3.2 🧠 — Mesurer le taux d'erreur de DeepSeek** — Fait · 2026-07-30. Compteur agrégé persisté dans `cache_generic` sous `comp_guard_stats_v1` (`evaluated`, `rejected`, `batches`, `since`), alimenté sans `await` pour ne jamais ralentir ni faire échouer une cote, et exposé par `GET /api/admin/health` via `getCompGuardStats()`. Renvoie `null` — jamais un `0 %` trompeur — tant qu'aucune cote n'a été calculée. Compteur volontairement approximatif (lecture-modification-écriture sans verrou) : indicateur de tendance, pas comptabilité ; une table dédiée avec upsert atomique ne se justifie pas ici. **Vérifié réellement** : lint propre, `test:cohorts` 28 OK, et `GET /api/admin/health` renvoie bien le champ (`compGuard: null`, 15 crons). **NON VÉRIFIÉ — le chemin d'écriture** : impossible de faire tourner le garde-fou, **130point est hors service** pendant cette tâche (3 requêtes directes sur 3 en timeout à 30 s, et une rafale de `[soldPrices] 130point fetch failed` en preview). Sans comparables, `filterSalesForTarget` n'atteint jamais `recordGuardOutcome`. À confirmer dès que 130point répond. Le seuil de décision reste : au-delà de 30 % de rejets, le matching IA ne mérite plus d'être le chemin principal.
- [x] **3.3 ⚡ — Repli si 130point tombe** — Fait · 2026-07-30. `getSoldPriceStats` rendait `EMPTY_STATS` dès que 130point échouait, faisant disparaître toutes les cotes du site à l'expiration du cache 24 h. Désormais : si une entrée de cache existe (même expirée), elle est servie avec `stale: true`, `staleAgeHours` et `fetchedAtIso`. Le drapeau remonte jusqu'à la carte (`fairValueStale` / `fairValueAsOf` dans `dealFinder.js`) et s'affiche « cote du 12 juillet » en ambre — une cote datée n'est JAMAIS présentée comme fraîche. Une cote périmée ne peut plus être `confidence: "high"` (dégradée à `medium`) : le marché a pu bouger. Les deux branches journalisent. **Contexte** : D7 s'est matérialisé pendant cette tâche — 130point totalement hors service (3 requêtes directes sur 3 en timeout à 30 s). **Vérifié réellement** : lint propre, `test:cohorts` 28 OK, build exit 0, et la branche « aucun cache » confirmée en preview sur un joueur jamais interrogé (`[soldPrices] 130point indisponible et aucun cache pour "hughes 2022-23 base dm-8" — aucune cote`). **NON VÉRIFIÉ — la branche PÉRIMÉE elle-même** : les entrées de cache locales datent de moins de 24 h, donc le chemin normal les sert avant d'atteindre le repli. La forcer demanderait de vieillir artificiellement une ligne de `cache_generic` en base réelle — non fait sans accord (garde-fou : une écriture en système partagé n'est pas couverte par une autorisation de vitesse). À confirmer au prochain incident réel, ou par un vieillissement de cache explicitement autorisé.

## Phase C — Calibrer le scoring (1/3)

- [ ] **2.1 🧠 — Réconcilier seuil du badge et plafond joueur** — les deux constantes s'ignorent. Rendre le seuil RELATIF (« meilleur deal parmi ceux à cote fiable ») plutôt qu'absolu, ou recalibrer. NE PAS toucher aux poids du score (guardrail CLAUDE.md). Corrige D3.
- [x] **2.2 ⚡ — Expliquer le score joueur là où il surprend** — Fait · 2026-08-03. Nouveau module pur `lib/scoreNarrative.js` : `establishedUpsideNote(player)` ne rend un texte que pour un producteur ÉTABLI (`pointsPerGame ≥ 0,6` ET (`nhlSeasons ≥ 4` OU `ageYears ≥ 25`)) dont le score reste **sous 7**. Toute donnée manquante → `null` : on n'explique jamais un cas qu'on ne peut pas établir. La note s'affiche sous le facteur « Le joueur » du modal de score (`.sdm-gauge__note`, filet `--ice`), c'est-à-dire **exactement là où le chiffre surprend** — le reste de `/deals` ne montre pas le score joueur, une bannière globale aurait été du bruit sur 80 cartes. Aucune ligne de `cardScoutScoreMath.js` touchée. **Vérifié réellement en preview** : Nick Suzuki (26 ans, 1,232 pts/match, score 6,4) → note affichée ; **contre-épreuve** Macklin Celebrini (20 ans, score 8,2) → aucune note. Lint propre. **Trouvé et corrigé au passage** : le narratif de repli « type de carte » interpolait `groupDisplayName` tel quel, émoji compris (« 🎴 OPC Plat… », « 💎 SPx… ») — violation du guardrail SVG-only qui avait survécu à T8 ; `stripCategoryEmoji` appliqué, vérifié disparu.
- [ ] **2.3 🧠 — Vérifier D6 (27 annonces pour McDavid)** — mesurer la répartition raw/gradée avant et après filtrage. Si le mode `raw` par défaut écarte l'essentiel de son marché, revoir le défaut ou rendre le basculement évident.

## Phase D — Liquidité (0/1)

- [ ] **1.3 🧠 — Indicateur de liquidité par carte** — champ dérivé du nombre de ventes 130point sur 120 j : `liquidity: "liquide" | "rare" | "aucune vente"`. Information que D1 rend inévitable, et qui a une valeur propre : une carte sans marché secondaire est un risque, pas une aubaine.

## Phase E — Doctrine « sans cote » (0/2) ⏸ EN ATTENTE DE DÉCISION UTILISATEUR

- [ ] **1.1 🧠 ⏸ — Trancher la doctrine « sans cote »** — décision produit, pas technique. Trois options exclusives : **(A)** n'afficher que les ~23 % cotables ; **(B)** deux blocs séparés, « Deals vérifiés » puis « Sans référence de prix » (**recommandé**) ; **(C)** remplacer la cote par liquidité + fourchette de prix demandés eBay, explicitement étiquetés. Ne pas coder avant arbitrage.
- [ ] **1.2 ⚡ — Mettre en œuvre la doctrine** — dépend de 1.1. Deux sections distinctes, jamais un mélange silencieux. Réutiliser `cn-card`, `dl-card__conf`.

---

## Bugs découverts en cours de route

- **B-A1 — La CI construit sur Node 20, qui est en fin de vie.** Trouvé pendant 4.2. Les deux
  workflows fixent `node-version: 20` (la version qui exécute `npm run build`, distincte du
  runtime des actions corrigé par 4.2). Node 20 est EOL depuis avril 2026, et la machine de dev
  tourne en Node 24 — la prod est donc construite sur une version plus ancienne que celle où le
  code est écrit. Non corrigé sur-le-champ : changer la version de build peut modifier le
  comportement du build, ce n'est pas trivial. À traiter comme une tâche propre, en alignant sur
  la version Node de Vercel.
- **B-B1 — Une carte « Checklist » peut devenir MEILLEUR CHOIX.** Trouvé pendant 3.1. Après
  invalidation du cache, le meilleur deal Demidov devient
  « 2025-26 Parkhurst #250 Ivan Demidov Check List » à −37 % sur 11 comps. La donnée est
  correcte — mais une carte de checklist (souvent multi-joueurs, sans valeur de collection) n'a
  rien à faire en tête d'un classement d'investissement. `analyzeListing.js` détecte déjà les
  cartes duales/checklist (`isDualCard`) pour écarter les comparables ; `dealFinder.js` n'a pas
  d'équivalent pour le classement. Non corrigé sur-le-champ : décider si les checklists doivent
  être exclues du classement ou seulement du badge relève du produit.
- **B-A2 — `smoke-prod.yml` cible le domaine qui redirige.** Trouvé pendant 4.2.
  `SMOKE_BASE_URL: https://cardmetrics.io` renvoie un 308 vers `www.cardmetrics.io`. `fetch`
  suit les redirections, donc le test passe — mais chaque appel paie un aller-retour inutile et
  dépend d'un comportement implicite. Traité dans la tâche 4.1.

---

## Ce que cet audit N'A PAS couvert

- **La section Hottest Deals** dans son flux propre (multi-joueurs, cron 6 h) — auditée via l'API par joueur seulement.
- **Le mode gradée** (`mode=graded`) — toutes les mesures sont en mode `raw`.
- **L'UX réelle** — aucun test utilisateur, aucune mesure de conversion vers eBay. D2 repose sur une distribution de verdicts, pas sur du comportement observé.
- **Le mobile** — non vérifié à 375 px.
- **Comparaison avant/après stricte** de la couverture des cotes suite au garde-fou `bdb6225` : les 23 % sont un état APRÈS, sans mesure équivalente avant.
