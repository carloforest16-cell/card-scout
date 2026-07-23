# PLAN-HOTTEST-DEALS.md — Refonte complète /deals & Hottest Deals

> **Objectif** : amener la page /deals au niveau « produit fini » — cotes honnêtes, zéro junk,
> UI qui donne envie d'acheter, analyse compréhensible par M./Mme tout le monde.
> **Exécution** : une tâche à la fois via la skill `loop-iteration` (vérifiée, commitée, CI verte).
> **Modèle suggéré par tâche** : 🧠 = Opus (logique cotes/scoring), ⚡ = Sonnet (UI/CSS/mécanique).
>
> **Règle d'or transversale** (guardrail CLAUDE.md) : jamais une donnée fausse présentée comme
> vraie. Chaque % vs cote affiché doit reposer sur une cohorte de LA MÊME carte. Dans le doute →
> « cote indisponible », jamais un chiffre inventé.

---

## Diagnostic — causes racines identifiées (référence pour toutes les tâches)

| # | Symptôme (vu en prod) | Cause racine exacte |
|---|---|---|
| B1 | **YG Retro cotée comme YG régulière** (Carlsson Retro 11 $ affiché « −81% », top deal du jour) | `lib/cardNumberExtractor.js:20-55` — `detectCardType` retourne la **première** règle qui matche ; `young-guns` (ligne 28) est testée avant `retro` (ligne 45). « Retro » n'est ni dans `PARALLEL_TAGS` ni dans `parallelColor` → la cohortKey d'une YG Retro est **identique** à celle de la YG base → même cote. Idem `detectCardGroup` (`lib/dealFinder.js:484-490`) : YG testé avant Retro/Clear Cut. Variantes touchées : Retro, Canvas YG, Deluxe, High Gloss (partiel), Exclusives (partiel), Rainbow. |
| B2 | **Cote auto trop large** (Suzuki auto MVP cotée 60,50 $ « −44% » à partir de ventes 34–112 $ d'AUTRES cartes autographiées) | `lib/soldPrices.js:364-378` — quand la requête précise donne <3 comps, escalade sur `fallbackQuery` grossière (« suzuki 2022 auto autograph » via `groupTypeToKeywords`) = toutes les autos du joueur, tous sets confondus. Le résultat est ensuite affiché comme « ventes réelles » avec un −44% de confiance apparente. `queryUsed` est déjà retourné mais jamais exploité pour dégrader le signal. |
| B3 | **Customs / hand-made passent encore** (Demidov « Limited Artist Signed » scoré 7,5 Acheter) | `lib/dealFinder.js:260-261` — `TITLE_EXCLUDE_FAN_OR_BAIT_RE` ne couvre ni `Artist Signed`, ni `ACEO`, ni `Hand ?made|Hand ?painted`, ni `Sketch`, ni les titres avec guillemets décoratifs. Le titre passe le filtre, matche `matchesAutoSignature` → groupe ✍️ Auto/RPA → scoré et affiché. |
| B4 | **Verdict « Acheter » sans cote** (Demidov : « Cote indisponible » + score 7,5 + CTA vert Acheter) | Aucun garde-fou : `attachInvestmentScores` / DeepSeek peuvent émettre « Acheter » même quand `fairValueCad == null`. Recommander l'achat sans aucune référence de prix = malhonnête. |
| B5 | **Sparkline = fausse donnée** (courbe verte « tendance » générée par du bruit aléatoire seedé sur le titre) | `app/deals/DealFinderClient.js:810-842` — `Sparkline` fabrique 7 points de bruit `Math.sin(seed…)`. Présentée à côté du prix comme une tendance de marché. Violation directe du guardrail. |
| B6 | **Bouton « Rafraîchir » placebo** | `refreshHottest()` (`DealFinderClient.js:1523-1525`) refait le même GET sans `refresh=1` → ressert le cache 6 h. L'API supporte pourtant `?refresh=1` (`app/api/deals/hottest/route.js:13`). |
| B7 | **« Alternatives moins chères » = code mort** | `DealFinderClient.js:1963-1968` et `2326-2331` — filtre sur `x.itemId` et `x.cardGroup`, deux champs qui **n'existent pas** dans le payload (les vrais champs : `listingIndex`, `groupType`). `undefined !== undefined` → toujours faux → jamais d'alternatives. |
| B8 | **Tracking clics eBay sans prix** | `DealFinderClient.js:791,1052` — `trackEbayClick({ price: d.priceCad })` mais le champ du listing est `d.price`. Prix toujours `undefined` en analytics. |
| B9 | **Filtre « Score minimum » ambigu** | `DealFinderClient.js:1517-1518` — filtre sur `card.cardScoutScore` (score **joueur**) alors que la carte affiche `investmentScore` (score **deal**). L'utilisateur règle 8+ et voit encore des deals 6,8 → incompréhensible. |
| B10 | **Badge « MEILLEUR DEAL » instable** | Attribué à `index === 0` de la liste **filtrée client** (`DealCard` rankBadge). Change selon les filtres, et hérite des cotes faussées (B1) → un −81% fictif devient « MEILLEUR DEAL ». |
| B11 | Warnings client redondants/incohérents | `detectCardWarnings` (client) warne Jumbo/Oversized… déjà exclus côté serveur (`TITLE_EXCLUDE_NON_CARD_RE`). Le warning « Custom Card » client ne s'affichera jamais non plus si B3 est corrigé. À rationaliser. |
| B12 | Filtre type « Gradée PSA » inutile en mode raw | `HOTTEST_CARD_TYPE_OPTIONS` identique dans les deux modes ; en raw le filtre PSA renvoie toujours 0 carte. |
| B13 | Langage prix incohérent | Trois formulations coexistent : « à 19% marché » (reason), « −81% » (delta), « Cote : 57,31 $ » — personne ne comprend que 19% = −81%. |
| B14 | Fourchette plus large que la cote, non expliquée | « ventes réelles 34,43 $–112,08 $ » collée à une cote de 60,50 $ sans explication → mine la confiance au lieu de la bâtir. |
| B15 | `startCompare`/`loadCompare` : deps `useCallback` incomplètes (`marketplace` manquant) | `DealFinderClient.js:1437-1480` — marketplace périmé si l'utilisateur change de préférence. Mineur. |

---

## PHASE 0 — Harnais de vérité (préalable à tout le reste)

### Tâche 0.1 🧠 — Fixtures de cohortes + script de non-régression ✅ Fait · 2026-07-22
> **Fait** : `scripts/test-cohorts.mjs` (23 cas, sémantique XFAIL/XPASS), branché en CI après le
> lint + `npm run test:cohorts`. Importe les modules PURS (`cardNumberExtractor.js`,
> `titleFilters.js`) — `cohortKeyForTitle` est server-only, mais sa source de vérité est
> `extractCardFingerprint().cohortKey`, testé directement. B1 confirmé empiriquement : Retro,
> Canvas, Deluxe s'effondrent tous sur `carlsson-2023-24-young-guns`. **7 XFAIL** en attente (3× B1
> variantes + 4× B3 customs — passeront au vert avec 1.1/2.1), **16 OK**, 0 échec réel, exit 0.
> Note : `CUSTOM_ART_RE` (importée via namespace, `undefined` pour l'instant) sera créée en 2.1 →
> les cas B3 flipperont automatiquement. Warning `MODULE_TYPELESS_PACKAGE_JSON` bénin (pas de
> `"type":"module"` — risquerait de casser next.config/postcss.config en CJS).

**Pourquoi d'abord** : les phases 1-2 modifient le cœur du matching. Sans harnais, chaque fix peut
recasser silencieusement un cas voisin (c'est déjà arrivé : saisons « 2024/25 » prises pour /25).
- Créer `scripts/test-cohorts.mjs` (exécutable `node scripts/test-cohorts.mjs`, zéro dépendance,
  importe `lib/cardNumberExtractor.js` et les regex pures — même pattern que `scripts/smoke.mjs`).
- Fixtures : ~40 titres eBay **réels** (piocher dans les captures/le cache Supabase), chacun avec
  la cohortKey attendue et le verdict d'exclusion attendu. Cas obligatoires :
  - `2023-24 UD Extended Leo Carlsson Young Guns Retro` ≠ cohorte de `… Young Guns #452`
  - `Young Guns Canvas`, `YG Deluxe`, `YG High Gloss`, `YG Exclusives /100`, `YG Rainbow`
  - `Ivan Demidov Limited Artist Signed "Montreal Canadiens"` → **exclu**
  - `ACEO custom`, `hand painted`, `sketch card`, `Homemade`, `Hand Made` → **exclus**
  - Faux positifs à protéger : `New Jersey Devils` (mot Jersey), `PSA 10 Sealed` (slab, pas pack),
    saison `2024/25`, `Gold Medal Team Canada` (pas un parallèle gold)
- Brancher dans `ci.yml` après le lint (le script sort code ≠ 0 si un cas échoue).
- **Critère** : script vert localement + en CI ; les cas B1/B3 sont pour l'instant marqués
  `expectedFail: true` (ils passeront au vert dans les phases 1-2 — preuve que le fix fixe).

---

## PHASE 1 — Intégrité des cotes (le cœur du problème)

### Tâche 1.1 🧠 — Les variantes Young Guns deviennent des cohortes distinctes (B1) ✅ Fait · 2026-07-22
> **Fait** : nouvelle dimension `variantTag` dans `lib/cardNumberExtractor.js` (`VARIANT_TAGS` =
> retro, canvas, deluxe, portrait, jumbo), détectée **indépendamment** du cardType et
> **disjointe** de `PARALLEL_TAGS` (Outburst/Exclusives/High Gloss déjà séparés — vérifié
> empiriquement, ne pas dupliquer). Garde `variantTag === cardType → null` (« UD Canvas » seul ne
> se dédouble pas). Propagé dans `fingerprint`, `cohortKey`, `searchQuery`, le retour, et
> `extractPartialFeatures`. Repli `pf|` mis à jour dans `dealFinder.js:cohortKeyForTitle`. Filtre
> 130point (`soldPrices.js:filterSalesBySampleFingerprint`) compare désormais `variantTag`. Les 3
> cas B1 du harnais passent au vert (flags `expectedFail` retirés) : Retro/Canvas/Deluxe ont
> maintenant leur propre cohorte. **Vérif** : harnais 19 OK / 0 échec réel ; lint vert. Build
> groupé en fin de Phase 1. Preview non lancée (cache Hottest 6 h masque — sera vérifié via
> `?refresh=1` en tâche 7.1).

- `lib/cardNumberExtractor.js` : introduire une dimension `variantTag` détectée **indépendamment**
  du cardType (car `detectCardType` s'arrête à la première règle) : `retro`, `canvas`, `deluxe`,
  `high gloss`, `rainbow`, `exclusives`, `clear cut/acetate`, `outburst`, `dazzlers`, `jumbo`
  (défense en profondeur), `portrait`. L'injecter dans `fingerprint`, `cohortKey` ET `searchQuery`
  (pour que 130point cherche « carlsson 2023 young guns retro », pas « young guns »).
- Même logique dans `detectCardGroup` (`lib/dealFinder.js`) : une « Young Guns Retro » peut rester
  affichée dans le groupe ⭐ Young Guns (UX), mais sa **cohorte de prix** doit être distincte —
  ne pas confondre groupe d'affichage et clé de cote.
- Vérifier le repli partiel (`extractPartialFeatures` + `pf|` keys) : le variantTag doit aussi y
  figurer, sinon les titres sans année re-fusionnent les variantes.
- `filterSalesBySampleFingerprint` (`lib/soldPrices.js:208`) : comparer aussi `variantTag`.
- **Critère** : fixtures B1 passent au vert ; une recherche Carlsson en preview montre la YG Retro
  avec sa propre cote (ou « cote indisponible »), plus jamais le −81%.

### Tâche 1.2 🧠 — Le repli de cote élargi ne produit plus de faux « −44% » (B2) ✅ Fait · 2026-07-22
> **Fait** : `getSoldPriceStats` expose `scope: "exact" | "broad"` (broad = résultat du
> `fallbackQuery` élargi). Propagé en `fairValueScope` par `enrichFairMapWith130Point` (+ confiance
> plafonnée `low`). `dealFinder.js` : scope broad → `fairValueCad=null`, `percentOfMarket=null`,
> `dealDeltaPct=null`, et la médiane part dans `referenceValueCad`/`referenceRange` (jamais
> labellisée « ventes réelles »). UI : nouveau bloc « Réf. cartes similaires : X–Y $ » (italique,
> en retrait, tooltip honnête) distinct de « Cote ». **Découverte** : `buildQuery` était dégénéré
> pour les clés fingerprint (`split("|")` échoue → repli = **nom du joueur seul** = toutes ses
> cartes, le vrai moteur de B2) — réécrit pour reconstruire une requête étroite (nom+année+
> set/type) à partir du nouveau format de clé. **Vérif** : harnais 19 OK ; lint vert ; le cas B2
> (autos de sets différents restent des cohortes distinctes) déjà verrouillé. Preview cache-masquée
> → 7.1.

Principe : **une cote élargie peut informer, jamais déclencher un signal de deal.**
- `lib/soldPrices.js` : `getSoldPriceStats` retourne déjà `queryUsed` — ajouter un champ explicite
  `scope: "exact" | "broad"` (`broad` = le résultat vient de `fallbackQuery`).
- `enrichFairMapWith130Point` : propager `scope` dans la fairMap (`fairValueScope`).
- `lib/dealFinder.js` (bloc `enrichedRows`, lignes ~1011-1047) : si `fairValueScope === "broad"`
  → `percentOfMarket = null`, `dealDeltaPct = null`, confiance plafonnée à `low`. La valeur reste
  transmise à part (`referenceValueCad`) pour affichage honnête.
- UI (`DealFinderClient.js`) : quand seule une référence élargie existe, afficher
  « Réf. autos de ce joueur : 34–112 $ » (libellé distinct de « Cote »), sans %, sans pill
  d'économie, sans badge « ventes réelles ».
- Resserrer aussi le repli pour les groupes Auto : `groupTypeToKeywords` doit inclure le set
  quand il est connu (« sp authentic auto » et non « auto autograph »).
- **Critère** : la Suzuki auto MVP n'affiche plus ni cote 60,50 $ ni −44% ; elle affiche la
  fourchette de référence clairement étiquetée, et ne peut plus être triée comme deal actionnable.

### Tâche 1.3 🧠 — Fourchette et cote racontent la même histoire (B14, B13) ✅ Fait · 2026-07-22
> **Fait** : vocabulaire unifié en ÉCART. `buildHeuristicReason` parle maintenant en « −18 % vs
> cote » (delta = pct − 100), plus jamais « à 82 % de la cote » — même mental model que le pill
> `dl-card__delta`. Prompt DeepSeek : format d'écart imposé « −X % vs cote » + 4 exemples réécrits
> (fini le mélange « −17% marché » / « 94% cote »). Fourchette P25–P75 : nouveau garde-fou
> `rangeCoheresWithCote` (carte + modal) — masquée si la cote sort de [P25×0,85 ; P75×1,15]. Note :
> le cas B14 d'origine (fourchette large 34–112 collée à une cote 60,50) était en fait du scope
> broad → déjà neutralisé en 1.2 (`fairValueRange=null`) ; 1.3 verrouille le principe pour l'exact.
> **Vérif** : lint vert, harnais 19 OK. Preview → 7.1.

- Un seul vocabulaire partout (cartes, modal, reason) : **« Cote »** = la valeur ; **« −X % »** =
  l'écart ; supprimer les « à 19% marché » du prompt DeepSeek et de `buildHeuristicReason`
  (reformuler en « −81 % vs cote » — même chiffre que le pill).
- La fourchette P25–P75 ne s'affiche que si `source === "sold"` ET scope exact, avec libellé
  « fourchette des dernières ventes » ; si elle contredit la cote (cote hors fourchette), ne pas
  afficher la fourchette (signal incohérent = on s'abstient).
- **Critère** : sur 10 cartes de preview, chaque % affiché = (prix − cote)/cote au % près, et
  aucune carte n'affiche deux chiffres contradictoires.

---

## PHASE 2 — Zéro junk (filtrage)

### Tâche 2.1 🧠 — Exclure customs / hand-made / art (B3) ✅ Fait · 2026-07-22
> **Fait** : `CUSTOM_ART_RE` + `isCustomOrArtTitle` dans `lib/titleFilters.js` (source unique
> pure, testable) : CUSTOM, Artist Signed, ACEO, Sketch, Hand made/painted/drawn/crafted, Homemade,
> Original Art(work), Art Card, Altered, Repaint. `CUSTOM` a **migré** de `TITLE_EXCLUDE_RE`
> (dealFinder) vers cette source unique. Appliqué dans `shouldExcludeTitle` **et** `guardJunkVerdict`
> (défense en profondeur → verdict « Passer », score ≤ 3). **Prudence faux positifs** : « Signed »
> seul reste valide (exige « Artist Signed »), « Art Card » exige l'espace (≠ « Artifacts »), pas de
> « Refractor »/« 1 of 1 » nus (la Demidov est déjà prise par « Artist Signed »). **Vérif** : les 4
> cas B3 passent au vert (flags retirés) ; harnais **23/23, 0 XFAIL** ; les 3 « keep » (vraie auto
> SP Authentic, YG régulière, PSA 10 Sealed) restent conservés ; lint vert.

- `lib/titleFilters.js` : créer `CUSTOM_ART_RE` exportée (source unique, testable par le harnais) :
  `Artist\s+Signed`, `ACEO`, `Sketch(\s+Card)?`, `Hand\s*-?\s*(?:made|painted|drawn|crafted)`,
  `Original\s+Art`, `Altered`, `One\s+of\s+a\s+Kind\b(?!.*\/1)`, `Repaint`, `Refractor` **si**
  aucun set officiel détecté (les vrais refractors Topps n'existent pas en hockey UD moderne),
  titres dont >30 % des mots sont entre guillemets décoratifs.
- L'appliquer dans `shouldExcludeTitle` + l'ajouter au `guardJunkVerdict` (défense en profondeur :
  si ça passe quand même, verdict forcé « Passer », score ≤ 3, jamais dans Hottest).
- Prudence faux positifs : `Signed` seul reste valide (vraies autos) ; c'est `Artist Signed` /
  contexte art qui exclut. Ajouter les contre-cas au harnais.
- **Critère** : fixtures B3 vertes ; la Demidov « Artist Signed » n'apparaît plus ; les vraies
  autos SP Authentic/Trilogy passent toujours (vérif preview sur 2-3 joueurs).

### Tâche 2.2 ⚡ — Rationaliser les warnings client (B11) ✅ Fait · 2026-07-22
> **Fait** : audit de chaque pattern de `detectCardWarnings` → tous déjà exclus serveur sauf
> **Magnet** (Fan Art/Custom/Art Card → CUSTOM_ART_RE ; Pick Your → PICK_LOT_RE ; Read Description
> → FAN_OR_BAIT_RE ; Jumbo/Oversized → NON_CARD_RE). Application du principe du plan : Magnet
> **déplacé** dans `TITLE_EXCLUDE_NON_CARD_RE` (serveur), puis `detectCardWarnings`, `DL_WARNING_ICON`,
> le bloc de rendu et tout le CSS `.card-warning*` **supprimés** (code mort). La carte n'affiche plus
> de warning : un junk = un trou serveur à combler, pas à signaler. **Vérif** : 0 référence
> `card-warning`/`detectCardWarnings` restante ; lint vert.

- `detectCardWarnings` : supprimer les warnings devenus impossibles (Jumbo, Oversized, Custom —
  exclus serveur) ; garder uniquement ceux qui peuvent réellement apparaître (« Read description »).
  Un warning qui ne se déclenche jamais = du poids mort ; un qui se déclenche = un échec du filtre
  serveur à corriger, pas à « warner ».
- **Critère** : grep de chaque pattern warning → soit il a un chemin d'apparition réel, soit il
  est supprimé.

---

## PHASE 3 — Honnêteté des verdicts et du classement

### Tâche 3.1 🧠 — Jamais « Acheter » sans cote fiable (B4) ✅ Fait · 2026-07-22
> **Fait** : `guardBuyWithoutFairValue` dans `dealFinder.js` (même pattern que `guardJunkVerdict`),
> appliqué dans les deux branches de `attachInvestmentScores`. `percentOfMarket == null` (pas de
> cohorte exacte fiable, ou scope broad) → verdict « Acheter » rétrogradé « Chercher mieux », score
> ≤ 6,9, upside max « Moyen ». Le CTA client passe alors seul à « Voir sur eBay » (isAcheter=false,
> aucun changement UI nécessaire). Règle miroir ajoutée au SYSTEM_PROMPT DeepSeek. **Exemption** :
> `scoreSource === "demo"` (mode sans eBay, déjà étiqueté « DÉMO ») pour ne pas vider la démo.
> **Vérif** : lint vert, harnais 23/23. Preview → 7.1 (test d'acceptation : 0 « Acheter » +
> « Cote indisponible »).

- Nouveau garde-fou déterministe dans `attachInvestmentScores` (même pattern que
  `applyPlayerQualityCap`) : si `percentOfMarket == null` (pas de cohorte fiable, ou scope broad)
  → verdict max « Surveiller », score plafonné à 6,9, upside max « Moyen », CTA client
  « Voir sur eBay » (jamais le bouton vert « Acheter sur eBay »).
- Exception assumée : AUCUNE. Une carte rare peut être belle, mais on ne dit pas « Acheter » sans
  référence de prix — on dit « Carte rare — juge par toi-même », c'est un positionnement de
  confiance.
- Mettre à jour le SYSTEM_PROMPT DeepSeek en conséquence (le garde-fou reste la source de vérité).
- **Critère** : impossible de trouver en preview une carte « Acheter » avec « Cote indisponible ».

### Tâche 3.2 🧠 — « Top deal du jour » mérité et stable (B10) ✅ Fait · 2026-07-22
> **Fait** : helper serveur exporté `assignDealRanks(cards)` (dealFinder.js) — deal actionnable =
> cote EXACTE fiable (percentOfMarket non null) + prix ≥ 5 % sous la cote + score ≥ 7,5 ; trié par
> écart le plus négatif ; #1 reçoit `isTopDeal`+`topDealReason` (« 46 $ sous la cote »), top 3
> reçoivent `rank`. Appelé sur la liste finale du pipeline recherche (`buildInvestmentIntelligence
> FromListings`) ET recalculé sur la sélection inter-joueurs finale du hottest (`buildHottestDealsFresh`,
> les rangs par-joueur étant caducs après merge/diversité) + le mock. Client : `rankBadge` lit
> `d.isTopDeal`/`d.rank`, plus jamais l'index de la liste filtrée. **Cache bumpé v6→v7** (nouveaux
> champs + cotes recalculées Phases 1-3 — évite 6 h de cotes faussées). **Vérif** : logique de rang
> unit-testée inline (biggest gap = #1, sans-cote jamais top, score<7,5 exclu) ; lint vert ; harnais
> 23/23. Preview → 7.1.

- Le badge « MEILLEUR DEAL » se calcule **serveur** (dans `buildHottestDealsFresh`), pas à
  l'index 0 client : le meilleur deal = cote fiable exacte + plus gros écart négatif + score ≥ 7,5.
  Champ `isTopDeal: true` sur la carte élue (et `topDealReason` court).
- Côté client : le badge suit la carte, peu importe les filtres. « TOP 3 » idem (champ `rank`).
- **Critère** : filtrer par équipe/prix ne déplace plus le badge sur une autre carte.

### Tâche 3.3 ⚡ — Supprimer la Sparkline fictive (B5) ✅ Fait · 2026-07-22
> **Fait** : composant `Sparkline` (bruit `Math.sin(seed)` présenté comme tendance de marché),
> son usage dans `dl-card__price-row` et le CSS `.dl-sparkline` supprimés. Quand il n'y a pas de
> pill d'économie réelle, la rangée de prix reste simplement au prix seul (le vide honnête > la
> courbe inventée). **Vérif** : 0 référence restante ; lint vert.

- Supprimer le composant `Sparkline` et son usage. À sa place (quand pas de pill d'économie) :
  rien, ou la fourchette de ventes réelle si elle existe (phase 1.3). Le vide honnête > la courbe
  inventée.
- **Critère** : aucun élément graphique sur la carte ne représente une donnée qui n'existe pas.

### Tâche 3.4 ⚡ — Bouton Rafraîchir réel (B6) ✅ Fait · 2026-07-22
> **Fait** : `refreshHottest` déclenche désormais un vrai `?refresh=1` (forceRefresh serveur) en
> **fire-and-forget** (pattern CLAUDE.md — un rebuild de ~40 joueurs prend des minutes, on n'attend
> pas), affiche un toast « Recalcul lancé — les nouveaux deals arrivent d'ici quelques minutes »,
> puis programme un refetch du cache à +90 s. L'âge du cache était déjà affiché par `RefreshBar`
> (`lastUpdatedAt={hottestFetchedAt}` → « Hottest Deals · Il y a 3 h »). **Vérif** : lint vert.
> Comportement réseau (déclenchement du rebuild) à confirmer en preview → 7.1.

- `refreshHottest()` : appeler `?refresh=1` **sans attendre** (fire-and-forget, pattern documenté
  dans CLAUDE.md — un forceRefresh prend des minutes), toast « Recalcul lancé — les nouveaux deals
  arrivent d'ici quelques minutes », puis re-fetch normal après ~90 s.
- Afficher l'âge du cache (« Deals calculés il y a 3 h ») à partir de `fetchedAt` — déjà transmis,
  sous-exploité.
- **Critère** : cliquer Rafraîchir déclenche un rebuild visible dans les logs, l'UI ne fige pas.

---

## PHASE 4 — Bugs mécaniques UI

### Tâche 4.1 ⚡ — Réparer ou retirer les « alternatives moins chères » (B7) ✅ Fait · 2026-07-22
> **Décision : retiré** (audit-code-mort). Le filtre testait `x.itemId`/`x.cardGroup` (champs
> inexistants) → mort depuis la création. Le réparer en groupant par `groupType` recréerait le
> mensonge de B1 (même groupe ≠ même carte) et la vraie clé (cohortKey) n'est pas exposée au
> client. Supprimé : le bloc de rendu `dl-card__alternatives`, le prop `alternatives`, `isChercher`,
> les 2 calculs `alts`, tout le CSS `.dl-card__alt*`. **Vérif** : 0 référence restante ; lint vert.

- Corriger les champs : `x.listingIndex !== d.listingIndex && x.groupType === d.groupType` — puis
  décider : la feature n'a jamais tourné ; si après fix elle produit du bruit (cartes différentes
  du même groupe ≠ alternatives réelles), la retirer proprement. Comparer des variantes différentes
  comme « alternatives » recréerait le mensonge de B1 → n'afficher que des alternatives de la
  **même cohorte**.
- **Critère** : soit des alternatives réellement comparables s'affichent, soit le bloc et son CSS
  sont supprimés (audit-code-mort).

### Tâche 4.2 ⚡ — Corriger le tracking prix (B8) + deps compare (B15) ✅ Fait · 2026-07-22
> **Fait** : `trackEbayClick` recevait `price: d.priceCad` (champ inexistant, le listing porte
> `d.price`) → prix toujours `undefined` en analytics ; corrigé aux 2 appels (CTA carte + modal).
> `marketplace` ajouté aux deps de `startCompare` et `loadCompare` (les 2 seuls warnings
> `exhaustive-deps` du repo → maintenant 0). **Vérif** : lint vert, 0 warning exhaustive-deps.
> Réception `priceCad` numérique côté `/api/ebay-click` à confirmer en preview → 7.1.

- `trackEbayClick({ … price: d.price })` (2 occurrences) ; ajouter `marketplace` aux deps de
  `startCompare`/`loadCompare`.
- **Critère** : `/api/ebay-click` reçoit un `priceCad` numérique (vérif network en preview).

### Tâche 4.3 ⚡ — Filtres compréhensibles (B9, B12) ✅ Fait · 2026-07-22
> **Fait** : le curseur « Score minimum » → **« Score du deal »** filtre désormais
> `investmentScore` (le chiffre affiché sur la carte), plus `cardScoutScore` (score joueur
> invisible) — régler 8+ ne laisse plus passer un deal 6,8 (B9). Les types de carte sont dérivés
> du payload courant (`availableCardTypeOptions`) : « Gradée PSA » disparaît en mode raw, aucune
> option ne peut produire un « 0 carte » structurel (B12) ; une pref sauvegardée pointant vers un
> type absent rebascule sur « Toutes ». **Vérif** : lint vert. Preview → 7.1.

- Renommer « Score minimum » → « Score du deal » et filtrer sur `investmentScore` (ce que la carte
  affiche). Si le filtre joueur a de la valeur, l'ajouter séparément (« Score joueur 7+ », pill
  optionnelle) — mais un seul curseur ne peut pas filtrer un chiffre invisible.
- Masquer « Gradée PSA » des types quand `hottestCardMode === "raw"` (et inversement, ne montrer
  que les types présents dans le payload courant — les options se calculent depuis les cartes).
- **Critère** : régler « Score du deal 8+ » ne montre que des cartes affichant ≥ 8,0 ; aucun
  filtre ne peut produire un état « 0 carte » structurel (option absente = pas affichée).

---

## PHASE 5 — Refonte visuelle (le « wow » 21st.dev)

> Préalable obligatoire : `python .claude/skills/ui-ux-pro-max/scripts/search.py "marketplace deals card listing" --design-system -p "Card Metrics"` (fait le 2026-07-22 : pattern Marketplace —
> la recherche est le CTA, trust signals proéminents, blocs généreux 48px+, hover bold 200-300ms).
> Tokens existants UNIQUEMENT (`--void`, `--ice`, `--gold`, `--profit`, `cn-*`, `wow-*` — ne rien
> inventer). S'inspirer des collections 21st.dev : cartes produit à hiérarchie brutale (1 chiffre
> héros), bento des stats, CTA magnétiques, skeletons fidèles.

### Tâche 5.1 ⚡ — La carte deal, réécrite pour la conversion
La carte actuelle empile 12 informations au même volume. Hiérarchie cible (dans l'ordre de
lecture, tout le reste dégagé ou replié) :
1. **Image** (déjà bien) + chip joueur + badge serveur TOP DEAL éventuel.
2. **L'économie en héros** : « 46 $ sous la cote » en gros (pas le prix !) quand elle existe —
   c'est LA raison d'acheter. Prix demandé en second. Sans cote fiable : le prix seul.
3. **Une ligne de preuve** : « Cote 57 $ · 12 ventes réelles · dernière il y a 3 j » — la
   provenance devient un argument de vente, pas une note de bas de page.
4. **Un seul CTA** : « Acheter sur eBay → » (vert, plein) ou « Voir sur eBay » (neutre) selon 3.1.
   Score/Analyse, +Vault, Alerte → une rangée d'icônes discrète.
- Supprimer de la carte : HOLD/UPSIDE (jargon → modal), reason tronquée (→ modal), la double
  mention du delta.
- Micro-interactions : réutiliser `wow-card-hover`, `hw-btn-shine` sur le CTA du top deal,
  `Reveal` existant. `prefers-reduced-motion` respecté. Touch targets ≥ 44px. Test 375px.
- **Critère** : checklist pre-delivery du skill (contraste 4.5:1, pas d'emoji-icônes, pas de
  scroll horizontal mobile) + capture avant/après.

### Tâche 5.2 ⚡ — La section Hottest Deals comme vitrine
- En-tête avec **preuve de fraîcheur** (« 30 deals · recalculés il y a 2 h · ventes réelles
  130point ») — la crédibilité est le différenciateur (cf. mémoire concurrents).
- Le TOP DEAL du jour en **carte héro pleine largeur** au-dessus de la grille (layout distinct,
  plus grande image, l'économie en très gros) — c'est l'accroche émotionnelle de la page.
- Filtres : les replier par défaut derrière un bouton « Filtres (2 actifs) » — la V1 montre 5
  contrôles avant le premier deal. Le produit d'abord, les réglages ensuite.
- Grille : garder `dl-grid`, densifier (l'espace vertical actuel par carte baisse le nombre de
  deals visibles au-dessus du pli).
- **Critère** : au chargement sur desktop 1280px, ≥ 4 deals ET le top deal visibles sans scroll ;
  mobile 375px : le top deal + 1 carte visibles.

### Tâche 5.3 ⚡ — États de chargement & vides à la hauteur
- Le skeleton reprend la nouvelle anatomie de carte (déjà le pattern, à resynchroniser).
- État vide filtré : proposer le retrait du filtre le plus restrictif (« Aucune carte < 20 $ —
  voir les 12 deals sous 50 $ ? ») au lieu du message générique.
- **Critère** : aucun flash de layout (CLS) entre skeleton et cartes réelles.

---

## PHASE 6 — Refonte « Analyse » (moins de blabla, plus de décision)

### Tâche 6.1 🧠 — Le modal Score devient une décision en 5 secondes
Structure cible du `ScoreDetailModal` (remplace l'empilement actuel reason + 3 facteurs + 5 stats
+ barre + table) :
1. **La phrase-verdict** (une seule, générée par règles, pas d'IA) :
   « Bonne carte, bon prix » / « Bonne carte, prix correct » / « Carte correcte, très bon prix » /
   « Trop cher pour ce que c'est » — mapping déterministe (score joueur × écart cote).
2. **Trois jauges visuelles** (Joueur / Prix / Type de carte) — les 3 facteurs existants de
   `buildScoreFactors` mais en barres 0-10 + un mot, texte détaillé en dépliable.
3. **La preuve** : mini-table des ventes réelles (déjà là, garder) — c'est la section la plus
   crédible du modal actuel.
4. CTA eBay unique en bas.
- Réécrire les `reason` DeepSeek : nouveau format imposé « [fait carte] + [fait prix] » ≤ 12 mots
  (le prompt actuel autorise 20 mots et produit du remplissage) ; l'UI n'affiche la reason QUE
  dans le modal.
- **Critère** : test du parent — montrer le modal à quelqu'un qui ne connaît rien aux cartes :
  il doit pouvoir dire « acheter ou pas » en < 10 s. Hauteur modal ≤ 1 écran mobile.

### Tâche 6.2 ⚡ — Le badge SCORE sur la carte s'aligne
- Le badge devient « 8,5 + verdict-couleur » (le /10 et « Analyse » en tooltip/hover) ; il ouvre
  le modal. Cohérence couleur stricte : vert ≥ 7,5, glace 6,5-7,4, neutre < 6,5 — les mêmes seuils
  partout (carte, modal, filtres). Centraliser dans un util partagé (`scoreColor` existe déjà,
  l'exporter et l'utiliser partout au lieu des seuils dupliqués).
- **Critère** : le même score affiche la même couleur sur la carte, le modal et le filtre.

---

## PHASE 7 — Vérification finale & déploiement

### Tâche 7.1 — Passe complète `verify-cardmetrics`
- Build + lint + CI verte ; preview desktop/mobile (375px) ; caches purgés (`?refresh=1` fire-and-
  forget puis revérifier) ; `scripts/smoke.mjs` ; `scripts/test-cohorts.mjs` 100 % vert (plus aucun
  `expectedFail`).
- Audit manuel de 20 cartes Hottest en prod-preview : pour chacune, vérifier à la main sur eBay/
  130point que la cote est celle de LA bonne carte. C'est le test d'acceptation ultime du plan.
- **Critère de fin de plan** : 0 carte avec cote empruntée à une autre variante, 0 custom, 0
  « Acheter » sans cote, badge top deal stable, UI validée sur mobile réel.

---

## Ordre d'exécution & modèles

| Ordre | Tâche | Modèle | Risque |
|---|---|---|---|
| 1 | 0.1 Harnais fixtures | Opus | faible |
| 2 | 1.1 Variantes YG | Opus | **élevé** (cœur du matching) |
| 3 | 1.2 Repli cote élargi | Opus | élevé |
| 4 | 2.1 Customs | Opus | moyen (faux positifs) |
| 5 | 3.1 Verdict sans cote | Opus | moyen |
| 6 | 1.3 Vocabulaire prix | Sonnet | faible |
| 7 | 3.2 Top deal serveur | Opus | moyen |
| 8 | 3.3 Sparkline / 3.4 Refresh / 4.1 / 4.2 / 4.3 | Sonnet | faible |
| 9 | 2.2 Warnings | Sonnet | faible |
| 10 | 5.1 → 5.3 UI | Sonnet (5.1 avec relecture Opus) | moyen |
| 11 | 6.1 Modal | Opus | moyen |
| 12 | 6.2 Badge | Sonnet | faible |
| 13 | 7.1 Vérif finale | Opus | — |

**Note caches** : les phases 1-3 changent le contenu des payloads Hottest → bump
`BLOB_CACHE_PATHNAMES` v6 → v7 (`lib/dealsHottest.js:38`) au premier changement de forme, sinon
6 h de cache serviront l'ancien format aux nouveaux composants (pitfall documenté).
