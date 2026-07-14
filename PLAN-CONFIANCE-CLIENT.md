# PLAN-CONFIANCE-CLIENT.md — Audit "client suspicieux" de cardmetrics.io

> Audit fait le 13 juillet 2026, en prod (cardmetrics.io), en jouant un collectionneur
> sceptique qui découvre le site pour la première fois. Chaque tâche suit le format :
> **Problème → Preuve → Fichiers → Comment faire → Vérification**.
> Exécutable tâche par tâche avec le skill `loop-iteration`.

---

## Journal d'exécution

**Session 2026-07-13 (nuit) — commencé via /loop :**
- ✅ **T1** (Deal Finder cassé) — `payloadMode: "search"` par défaut sur /api/deals,
  nouveau `TITLE_EXCLUDE_PACK_BOX_RE` + "Giveaway", garde-fou `guardJunkVerdict`.
  Vérifié live : McDavid raw 1 → 24 annonces, 0 junk. Commit `0ed71f0`, CI verte.
- ✅ **T3** (données à 0.0) — CountUp + ScoreGauge démarrent à la vraie valeur,
  anim seulement si visible + motion permis. Vérifié avec document.hidden=true :
  jauges /opportunites réelles, home « 900+ ». Commit `671d8d1`, CI verte.
- ✅ **T4** (enchères) — fenêtre 24h stricte (36→24), validation nom joueur.
  Filtre pack/lot déjà couvert par T1. État vide déjà présent. Commit `27f3b3b`.
- ✅ **T2** (page joueur skeleton) — **CONFIRMÉ FAUX POSITIF par Carlo** : la page
  fonctionne bien en vrai navigateur. C'était un artefact de l'env de test
  (document.hidden). Aucun changement nécessaire.
- ✅ **T9** (titres dupliqués) — suffixe de marque retiré de 18 metadata.title
  top-level (le template racine l'ajoute une fois). openGraph/twitter intacts.
  Vérifié : /pulse → « Market Pulse | Card Metrics ». Commit `b59e210`, CI verte.
- ✅ **T6** (offseason, partiel) — helper isOffseason() + framing /pulse
  (TEMPS RÉEL→HORS-SAISON, LIVE→HORS-SAISON, bannière). Commit `ebff25b`. Reste
  optionnel : mock « Momentum 10 matchs » de la home (décoratif, basse priorité).
- ✅ **T7** (retirer EN) — pill langue retiré de PrefsToggle + modal ; marché
  eBay CA/US conservé. Commit `382326e`, CI verte.
- ✅ **T12** (smoke tests contenu) — scripts/smoke.mjs enrichi avec validateurs :
  scores opportunités > 0 (T3), pas de « 0.0 » rendu (T3), deals McDavid ≥ 5 sans
  pack/lot (T1), enchères ≤ 24h + bon joueur (T4), titre non dupliqué (T9).
  17/18 verts contre prod. Le seul rouge (T4) est un cache d'enchères périmé
  (généré à 02:53 UTC avec l'ancien code 36h ; le forceRefresh on-demand 504 au-delà
  de 60s) → repassera vert au prochain cron auctions (0 8 * * *, ~08:00 UTC).
- ✅ **T5** (calibration verdicts) — le pipeline hottest passe désormais le Card
  Metrics Score de chaque joueur au scoring (blend 60% qualité) + plafond dur
  score ≤ CM+1.5 + validation nom + diversité max 2/joueur. Rebuild réel : spread
  6.3–7.0 au lieu de 12× « Acheter Fort 8.7 ». Commit `4ec862e`.
  ⚠️ Effet de bord à surveiller : les Hottest Deals sont maintenant surtout
  « Chercher mieux » (honnête vu les scores math-only 5-6 des joueurs, mais un peu
  mou pour une section « DEALS » — tuning possible du plafond si Carlo trouve ça
  trop conservateur).
- ✅ **T10** (progression Deal Finder) — composant SearchProgress (stepper 5
  étapes, timer d'état + barre CSS, reduced-motion ok) remplace le spinner muet
  pendant les ~15s d'analyse. Vérifié : rendu + avancement observés en live.
- ⬜ Reste : T8 (émojis→SVG), T11 (modal bienvenue), T13 (page compte).

### ⚠️ T8 — approche OBLIGATOIRE (piège identifié 2026-07-14)

Les émojis de catégorie (⭐ ✍️ 🎽 💎 🌈 🎴) sont **incrustés dans les chaînes
`groupType`** (constantes de `lib/dealFinder.js` : `AUTO_GROUP_GENERIC`,
`FIXED_CARD_GROUPS`, etc.) qui servent AUSSI de **clés** dans les maps de poids
(`lib/auctionDeals.js` GROUP_WEIGHTS) et dans les caches persistants. **NE PAS
renommer ces chaînes** — ce serait exactement le type de rename d'identifiant
interne qui a cassé la prod 2 semaines en juin (voir CLAUDE.md).

Faire un **transform DISPLAY-ONLY** :
1. Créer `app/components/CategoryIcon.js(x)` : map libellé/émoji → SVG lucide
   (Star, PenTool, Shirt, Gem, Palette, Layers…) + fonction `stripCategoryEmoji(gt)`
   qui enlève l'émoji de tête pour l'affichage.
2. Aux sites d'affichage (DealFinderClient, EncheresClient, PicksClient,
   OpportunitesClient — chercher où `groupType`/`cardType` est rendu), afficher
   `<CategoryIcon type={gt} />` + `stripCategoryEmoji(gt)` au lieu de la chaîne brute.
3. Laisser les constantes `groupType` INTACTES (clés/caches/poids inchangés).
4. Émojis restants hors catégories : 🔥⚡💎 sur /picks (PICK_TYPES dans PicksClient),
   🇨🇦🇺🇸 des toggles marché (PrefsToggle) → SVG/texte « CA »/« US ».
5. Vérifier : `grep -rn "⭐\|✍️\|🎽\|💎\|🌈\|🎴\|🔥\|⚡" app --include=*.js --include=*.jsx`
   ne renvoie plus rien dans du JSX rendu (les constantes lib/ peuvent garder
   l'émoji puisqu'il est strippé à l'affichage — ou le retirer aussi si on ajuste
   partout, mais display-only est plus sûr).

Reprise conseillée : **T8** (avec l'approche ci-dessus) puis T11 (retirer le modal
bloquant) et T13 (page « pourquoi un compte »).

---

## Ce qui fonctionne déjà bien (à ne PAS toucher)

- **La section Transparence de la home** ("Ce que Card Metrics est — et n'est pas") :
  honnête, rare chez les concurrents, c'est un vrai différenciateur de confiance. Le claim
  "open-source" est vrai (repo GitHub public, vérifié).
- **/joueurs** : rapide, 940 joueurs réels, scores cohérents, tri/filtres qui marchent.
- **/pulse** : riche, catégories claires (En feu / Breakout / Valeur cachée / En baisse),
  alertes NHL réelles et datées.
- **Les cartes Hottest Deals** (pipeline cron) : cote, %, explication d'une ligne, hold
  timeline — le format est excellent.
- **Le disclaimers systématique** "Cote basée sur annonces actives — pas les ventes réelles"
  partout où c'est pertinent.
- **La navigation flat 7 items** et le footer complet.

Le problème n'est pas le design ni le concept — c'est que **les flows principaux trahissent
la promesse** dès qu'un client les teste sérieusement. Voir ci-dessous.

---

# P0 — Ça casse la confiance immédiatement

## Tâche 1 — Deal Finder : recherche d'une superstar = 15 s d'attente pour 1 résultat junk

**Problème.** LE flow vendu par la home ("cherche un joueur → verdicts"). Testé en prod :

| Recherche | Temps | eBay total | Affiché | Le résultat |
|---|---|---|---|---|
| Sidney Crosby (raw) | 16,7 s | 200 | **1** | une carte *jersey* (censée être exclue) |
| Connor McDavid (raw) | 15,4 s | 200 | **1** | un **PACK scellé de 8 cartes** 2015-16 |
| Connor McDavid (gradée) | ~15 s | 200 | **1** | une Wire Photos obscure |

Un client suspicieux conclut : "l'outil ne trouve rien sur les joueurs que je connais,
et ce qu'il trouve est du déchet qu'il me dit d'ACHETER". Fatal.

**Cause (déjà diagnostiquée dans le code).** Deux bugs qui se combinent :

1. `detectSearchIntent()` ([dealFinder.js:43](lib/dealFinder.js:43)) : un nom simple
   ("Connor McDavid" = 2 tokens) → mode `curated`. En mode curated,
   `buildInvestmentIntelligenceFromListings` ([dealFinder.js:979-1009](lib/dealFinder.js:979))
   n'affiche **que les verdicts "Acheter"** (`buyListings`). Pour une superstar dont les
   cartes sont au prix du marché, DeepSeek ne donne presque jamais "Acheter" → 1 résultat.
2. Les filtres d'exclusion laissent passer les packs scellés : `TITLE_EXCLUDE_PICK_LOT_RE`
   ([dealFinder.js:276](lib/dealFinder.js:276)) matche "Pack of" mais pas "8 card PACK",
   "Fat Pack", "Retail Pack", "Hobby Box". Et comme un pack coûte 4 $ vs une cote de single
   à 50 $, le scoring le voit à -92 % → verdict "Acheter" avec un gros score. Le junk
   remonte donc EN PREMIER.

**Comment faire.**

a) **Mode search par défaut pour une recherche utilisateur.** Dans
   [app/api/deals/route.js](app/api/deals/route.js), passer une option
   `payloadMode: "search"` quand la requête vient de la page /deals (le param existe déjà
   dans `buildInvestmentIntelligenceFromListings`, il n'est juste jamais mis à "search"
   pour un nom simple). Le plus simple : dans `getDealFinderResult`
   ([dealFinder.js:1413](lib/dealFinder.js:1413)), remplacer `detectSearchIntent(name)`
   par `"search"` quand l'appel vient de l'API publique (ajouter une option
   `options.payloadMode` et la passer depuis la route). Garder "curated" uniquement pour
   les pipelines internes (hottest, page joueur) qui veulent du "Acheter only".
   L'UI /deals a déjà les onglets Tous/Acheter/Surveiller/Passer côté client (le
   commentaire ligne 989-990 le dit) — elle est prête à recevoir tout le batch scoré.

b) **Renforcer les filtres pack/lot/box.** Dans `TITLE_EXCLUDE_PICK_LOT_RE`
   ([dealFinder.js:276](lib/dealFinder.js:276)), ajouter :
   `\d+\s*cards?\b`, `\bFat\s*Pack\b`, `\bRetail\s*Pack\b`, `\bHobby\s*Box\b`,
   `\bBlaster\b`, `\bMega\s*Box\b`, `\bTin\b`, `\bSealed\b`, `\bBreak\b`,
   `\bPossible\b` (les titres "Possible Young Guns" = pack, jamais une carte précise),
   et `^\(\d+\)` (titres qui commencent par "(3)" = lot).
   ⚠️ Tester contre les faux positifs : "Sealed" peut apparaître sur une slab PSA —
   vérifier sur un échantillon de 200 titres réels avant de merger.

c) **Garde-fou scoring.** Dans le prompt/fallback de
   [lib/dealInvestmentScore.js](lib/dealInvestmentScore.js) : si le titre matche un
   pattern pack/lot qui aurait dû être exclu, forcer verdict "Passer" (défense en
   profondeur — le filtre a priorité, mais un raté ne doit jamais devenir "Acheter 8.7").

d) **Vérifier pourquoi le filtre jersey a laissé passer Crosby.** La carte
   "Credentials Arena Giveaways - Jerseys" est passée parce que
   `isStandaloneJerseyListing` ([dealFinder.js:291](lib/dealFinder.js:291)) n'est appliqué
   qu'en mode gradé (`if (cardMode === CARD_MODE_RAW) return false;` ligne 331 —
   le early-return saute le check jersey en raw). Décider : soit appliquer le check jersey
   aux deux modes, soit documenter pourquoi raw l'exempte.

**Vérification.** En prod après deploy : `/api/deals?player=Connor%20McDavid&mode=raw&refresh=1`
doit retourner ≥ 10 listings, zéro titre contenant pack/lot/box, et un mélange de verdicts.
Pareil pour Crosby, Bedard, Caufield. Ajouter ce check au smoke test (Tâche 12).

---

## Tâche 2 — Page joueur : reste bloquée sur les skeletons (à reproduire en priorité)

**Problème.** `/player/8478402` (McDavid) en prod : le HTML serveur contient tout le
contenu (hero, stats, CTA — vérifié par curl), mais dans mon navigateur de test la page
est restée sur `pl-hero--skeleton` indéfiniment (60 s+). Les scripts `$RC` de swap
Suspense sont présents dans le stream mais le swap ne s'exécute pas, même appelé à la main.
Console vide, tous les chunks JS chargés.

⚠️ **Peut être un artefact de mon environnement de test** (onglet caché — pitfall connu du
CLAUDE.md). MAIS un client sur onglet en arrière-plan, connexion lente ou vieux mobile peut
vivre la même chose. La page joueur est la destination de TOUS les liens du site
("Fiche détaillée", "Voir le joueur") — si elle rate une fois sur dix, c'est un désastre.

**Comment faire.**

a) D'abord **reproduire dans un vrai navigateur** : Chrome normal, onglet visible, réseau
   throttlé "Fast 3G" ; puis charger la page dans un onglet en arrière-plan et basculer
   dessus après 10 s. Si ça se reproduit → bug réel.
b) Si bug réel : le hero n'a pas besoin de streaming. `getPlayerLandingCached` est déjà
   en cache mémoire — retirer le `<Suspense>` autour de `PlayerHeroSection` dans
   [app/player/[id]/page.js:113](app/player/[id]/page.js:113) et rendre le hero
   directement (le TTFB monte de quelques centaines de ms mais la page devient fiable).
   Garder le Suspense uniquement pour `PlayerStatsHistorySection`.
c) Filet de sécurité : un petit script client qui, si `.pl-hero--skeleton` existe encore
   après 8 s ET que le contenu est dans le DOM (templates non swappés), force un
   `location.reload()` une seule fois. Grossier mais ça évite l'écran mort.

**Vérification.** Page joueur affiche nom + photo + score en < 3 s sur Fast 3G, et jamais
de skeleton permanent. Ajouter au smoke test : le HTML de `/player/8478402` répondu au
client (pas juste le stream) doit contenir "McDavid" hors template.

---

## Tâche 3 — Les vraies données affichent 0 (gauge "0.0/10", "0+ joueurs analysés")

**Problème.** Sur `/opportunites`, les 10 joueurs affichent **"0.0 SCORE / 10"** tant que
l'animation n'a pas tourné ; sur la home, le trust badge affiche **"0+ JOUEURS ANALYSÉS"**.
L'API retourne pourtant `investmentScore: 8.2`. Cause : `ScoreGauge`
([app/components/ScoreGauge.js:13](app/components/ScoreGauge.js:13)) part de `drawn = 0`
et attend IntersectionObserver + `requestAnimationFrame` ; `CountUp` pareil. Dans un onglet
caché, rAF ne tire jamais → 0 permanent. C'est aussi ce que voient les crawlers
(SEO : Google indexe une page "Top opportunités" pleine de 0.0) et potentiellement les
users `prefers-reduced-motion`.

**Règle à instaurer : une vraie donnée n'a JAMAIS 0 comme état initial de rendu.**
On anime la présentation, pas la valeur.

**Comment faire.**

a) Dans [ScoreGauge.js](app/components/ScoreGauge.js) : initialiser
   `useState(v)` au lieu de `useState(0)`, et n'animer que si
   `!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches` —
   dans ce cas repartir de `v * 0.5` vers `v` (l'effet visuel reste, le pire cas affiche
   la bonne valeur). Le `<CountUp>` interne : lui passer la valeur finale comme contenu
   SSR (vérifier [app/components/CountUp.js](app/components/CountUp.js) — même fix).
b) Home : le compteur `SharedCountUp value={900}` dans
   [app/home/HomeCinematic.js:162](app/home/HomeCinematic.js:162) — même fix, ET
   remplacer le 900 hardcodé (l'annuaire en a 940 — incohérence facilement repérée).
   Soit passer le count réel depuis le serveur (`players` count, cache 24 h), soit
   écrire "900+" en dur SANS animation (un compteur qui monte de 0 à 900 n'ajoute rien).
c) Grep tous les usages de `CountUp`/`ScoreGauge` et appliquer partout :
   `grep -rn "CountUp\|ScoreGauge" app --include=*.js --include=*.jsx`.

**Vérification.** `curl -sL cardmetrics.io/opportunites | grep -o '0\.0'` → aucun match.
Charger /opportunites dans un onglet en arrière-plan 10 s, basculer : scores corrects.

---

## Tâche 4 — Enchères : lots mal filtrés, mauvais joueur, "26h" dans une page "moins de 24h"

**Problème.** La page /encheres (4 enchères seulement) contient, vu en prod :
- Un **Fat Pack 26 cartes** "Possible Young Guns" taggé ⭐ YOUNG GUNS, "cote 50 $",
  −92 % — comparer un pack scellé à la cote d'une single, c'est le genre de faux deal
  qui grille la crédibilité du site entier.
- Un lot "(3) 2025-26 MVP Gold Script **Noesen Trouba Bratt**" attribué à **Jack Hughes**
  (il n'est même pas dans le lot) — et "Gold Script" = fac-similé, que
  `isFakePrintedAutograph` détecte déjà, mais le pipeline enchères ne l'utilise pas.
- Une enchère à **"26h 00min"** sous un titre qui promet "moins de 24 h".

**Comment faire.** Dans [lib/auctionDeals.js](lib/auctionDeals.js) :
a) Appliquer `shouldExcludeTitle()` + les nouveaux patterns pack/lot de la Tâche 1 à
   chaque enchère candidate (importer depuis dealFinder.js).
b) Valider que le nom du joueur détecté apparaît dans le titre
   (`title.toLowerCase().includes(lastName.toLowerCase())` au minimum) — sinon rejeter.
c) Filtrer strictement `endsInMs <= 24 * 3600 * 1000` (ou changer le titre de la page en
   "moins de 48 h" — mais 24 h strict est plus punchy).
d) Si après filtrage il reste < 3 enchères, afficher l'état vide honnête existant plutôt
   que du junk ("Pas assez d'enchères fiables en ce moment — reviens plus tard").

**Vérification.** /encheres : aucun titre pack/lot, chaque nom de joueur présent dans son
titre, aucune durée > 24 h.

---

# P1 — Crédibilité du produit

## Tâche 5 — Calibration des verdicts : tout est "ACHETER 8+", même les inconnus

**Problème.** Sur les Hottest Deals : Ronnie Attard (AHL) 8.7 = même score que
Charlie McAvoy 8.7. Jaxson Stauber, Corson Ceulemans (2 cartes JERSEY Team Canada
juniors !) → "ACHETER, UPSIDE Fort". 12 cartes affichées, 12 "ACHETER". Un client
sceptique voit un site qui dit acheter n'importe quoi — un verdict qui dit toujours oui
ne vaut rien.

**Comment faire.**
a) Dans [lib/dealInvestmentScore.js](lib/dealInvestmentScore.js), intégrer la notoriété
   du joueur (le `playerContext` avec `cardMetricsScore` existe déjà dans le pipeline) :
   un joueur sans score Card Metrics ou score < 5 → cap du score d'investissement à ~6.5
   et jamais "UPSIDE Fort". Une carte jersey non-auto non-numérotée → cap encore plus bas
   (c'est du volume, pas de l'investissement).
b) Dans [lib/dealsHottest.js](lib/dealsHottest.js), imposer de la diversité : max N cartes
   du même joueur (il y a 2 Ceulemans et 2 McAvoy et 2 Raymond sur 12), et prioriser les
   joueurs qui ONT un Card Metrics Score.
c) Page admin : ajouter un mini-histogramme de distribution des verdicts sur les 7 derniers
   jours (si > 80 % "Acheter", la calibration a dérivé).

**Vérification.** Hottest Deals affiche un mélange de verdicts, plus de jersey juniors en
tête de liste, et les scores des inconnus < scores des étoiles à deal équivalent.

---

## Tâche 6 — Mode hors-saison : "Momentum 10 matchs" et "EN FEU" en plein mois de juillet

**Problème.** On est le 13 juillet — la saison NHL est finie depuis un mois. Le site
affiche "Momentum 10 matchs +18 %", "EN FEU", "momentum le plus fort cette semaine".
N'importe quel fan de hockey sait qu'il n'y a AUCUN match — donc ces chiffres sont
forcément vieux, donc "temps réel" est un mensonge, donc tout le reste devient suspect.
C'est LE détail qui fait décrocher un connaisseur (= exactement la cible du produit).

**Comment faire.**
a) Créer un helper `isOffseason()` dans [lib/sportConfig.js](lib/sportConfig.js)
   (NHL : ~mi-juin → fin septembre, dates configurables par sport).
b) En offseason : les labels changent — "Momentum 10 matchs" → "Fin de saison 2025-26",
   "EN FEU cette semaine" → "Les plus forts finishers", le badge "LIVE" de /pulse →
   "SAISON MORTE · draft, contrats et trades", et les Picks Hebdo deviennent
   "Picks offseason — acheter avant le camp d'entraînement" (le pitch est même MEILLEUR :
   l'offseason est le moment où on achète avant la hype de la rentrée).
c) Le facteur momentum lui-même (13 facteurs) n'est PAS touché — c'est ta règle, aucun
   changement de poids. On change uniquement le framing UI. (Skill `toucher-au-score`
   à consulter si jamais ça déborde sur le calcul.)

**Vérification.** En juillet, aucun texte ne prétend que des matchs sont en cours ;
les sections expliquent d'où viennent les chiffres.

---

## Tâche 7 — Le toggle EN est factice : le retirer (court terme)

**Problème.** FR/EN dans la nav + choix de langue dans le modal de bienvenue + footer.
Réalité : [lib/i18n/en.js](lib/i18n/en.js) existe (126 lignes) mais seulement 5 fichiers
consomment `usePreferences` — cliquer "English" ne traduit rien. Un anglophone choisit
English, tout reste en français → il pense que le site est cassé et part.

**Comment faire.** Retirer l'option EN de : la nav ([app/AppNav.js](app/AppNav.js)), le
modal ([app/components/PreferencesModal.jsx](app/components/PreferencesModal.jsx) —
garder uniquement le choix de marché eBay CA/US qui, lui, fonctionne), le footer
([app/components/Footer.js](app/components/Footer.js)). Garder lib/i18n en place pour le
jour où l'i18n sera un vrai chantier (c'est un gros projet séparé — next/intl, routing
/en, traduire les narratifs DeepSeek — à backloger, pas à moitié-faire).

**Vérification.** Aucune mention de EN/English dans l'UI ; le choix de marché eBay
fonctionne toujours.

---

## Tâche 8 — Émojis utilisés comme icônes partout (violation de ta propre guideline)

**Problème.** ⭐ Young Guns, ✍️ Auto, 🎽 Jersey, 💎 SPX, 🌈 Parallèle, 🔥⚡💎 sur /picks,
🇫🇷🇺🇸🇨🇦 dans le modal et le footer. Le CLAUDE.md dit "No emojis as icons (SVG/lucide
only)". Rendu inconsistant selon l'OS, et ça fait amateur sur un produit qui se veut
"intelligence".

**Comment faire.** Créer un composant `CategoryIcon` (SVG inline ou lucide-react déjà
installé) mappant chaque catégorie de carte → icône (star, pen-tool, shirt, gem,
palette…). Remplacer dans : DealFinderClient.js, la page /encheres, /picks
(🔥→flame, ⚡→zap, 💎→gem de lucide), PreferencesModal/Footer (drapeaux → texte "FR · CAD"
/ "EN · USD" ou petits SVG). Grep : `grep -rn "⭐\|✍️\|🎽\|💎\|🌈\|🔥\|⚡\|🇫🇷\|🇺🇸\|🇨🇦" app lib --include=*.js --include=*.jsx`.

**Vérification.** Le grep ci-dessus ne retourne plus rien dans du JSX rendu.

---

## Tâche 9 — Titres dupliqués "… | Card Metrics | Card Metrics"

**Problème.** `/pulse` → "Market Pulse | Card Metrics | Card Metrics", pareil /picks,
/joueurs, /analyse, /encheres. Cause : [app/layout.js:60](app/layout.js:60) a
`template: "%s | Card Metrics"` ET les pages mettent "X | Card Metrics" ou
"X — Card Metrics" dans leur propre titre. Visible dans l'onglet, dans Google, et dans
les partages — ça crie "site pas fini".

**Comment faire.** Grep `title.*Card Metrics` dans `app/**/page.js` et retirer le suffixe
de chaque page (garder juste "Market Pulse", "Picks Hebdo", etc. — le template du layout
ajoute le reste).

**Vérification.** `curl -sL cardmetrics.io/pulse | grep -o '<title>[^<]*'` →
"Market Pulse | Card Metrics" une seule fois. Vérifier les 8 pages publiques.

---

# P2 — Conversion & finition

## Tâche 10 — Attente Deal Finder : 15 s de silence

**Problème.** Même une fois la Tâche 1 réglée, un cold search prend 10-15 s (eBay +
DeepSeek). Aujourd'hui l'utilisateur fixe un spinner sans savoir si ça travaille.
15 s muettes = fermé l'onglet.

**Comment faire.** Dans [app/deals/DealFinderClient.js](app/deals/DealFinderClient.js),
un stepper de progression pendant le fetch (purement client, pas besoin de vrai
streaming) : "Recherche eBay… (~200 annonces)" → 3 s → "Filtrage des reprints et lots…"
→ 6 s → "Scoring IA de chaque carte…" → 10 s → "Presque prêt…". Animation CSS pure
(pitfall AnimatePresence connu — éviter framer pour du texte critique). Bonus : squelettes
de cartes qui pulsent en dessous.

**Vérification.** Recherche à froid : le texte d'étape change au moins 3 fois, jamais
d'écran figé.

## Tâche 11 — Modal de bienvenue : friction avant la première impression

**Problème.** Première visite = modal bloquant "Choisis tes préférences" AVANT d'avoir vu
quoi que ce soit. On demande un engagement avant d'avoir donné de la valeur — et après la
Tâche 7, il ne reste qu'un choix (marché eBay) qui a un défaut évident (CA).

**Comment faire.** Supprimer le modal bloquant. Défaut silencieux : EBAY_CA/CAD, et le
`PrefsToggle` existant dans la nav/footer permet de changer. Si tu veux garder une
notion d'accueil, une bannière discrète dismissable en bas ("🇨🇦 Prix en CAD — changer")
suffit — sans bloquer le hero.

**Vérification.** Première visite (navigation privée) : le hero est visible immédiatement,
aucun modal.

## Tâche 12 — Smoke tests anti-régression pour tout ce qui précède

**Problème.** Le smoke actuel (scripts/smoke.mjs, 12 routes) vérifie que ça répond 200 —
pas que les données sont saines. /opportunites affichait 0.0 partout et le smoke était vert.

**Comment faire.** Ajouter à [scripts/smoke.mjs](scripts/smoke.mjs) des asserts de contenu :
- `/api/opportunites/top` → chaque `investmentScore > 0` ;
- `/api/deals?player=Connor McDavid` → `validListings >= 5` et aucun titre matchant
  le regex pack/lot ;
- `/api/auctions/ending-soon` → chaque `endsInMs <= 24h`, nom du joueur dans le titre ;
- HTML `/opportunites` → ne contient pas ">0.0<" ;
- HTML `/player/8478402` → contient "McDavid" hors `<template>` ;
- `<title>` des pages publiques → une seule occurrence de "Card Metrics".

**Vérification.** `node scripts/smoke.mjs` vert en local contre prod ; le cron quotidien
attrapera les régressions futures.

## Tâche 13 — Page "Pourquoi un compte ?"

**Problème.** "Connexion" dans la nav sans jamais dire ce qu'un compte apporte (Vault,
watchlist, alertes, digest). La home dit même "Aucune inscription" — un client ne comprend
pas pourquoi il créerait un compte.

**Comment faire.** Sur la page de login ([app/auth/login](app/auth/login)), ajouter un
panneau latéral 3 bullets avec icônes SVG : "Ton Vault — suis la valeur de ta collection",
"Alertes de prix sur tes joueurs", "Digest quotidien par email". Et sur la home, sous la
section transparence, la carte "Va plus loin avec un compte" existe déjà — vérifier
qu'elle liste ces 3 bénéfices concrets.

**Vérification.** Un nouvel utilisateur peut dire en 5 s ce qu'un compte lui donne.

---

## Ordre d'exécution recommandé

| # | Tâche | Impact | Effort |
|---|---|---|---|
| 1 | Deal Finder search cassé (T1) | 🔥🔥🔥 | Moyen |
| 2 | Reproduire + fixer page joueur (T2) | 🔥🔥🔥 | Petit-Moyen |
| 3 | Scores à 0.0 / compteur 0+ (T3) | 🔥🔥🔥 | Petit |
| 4 | Enchères junk (T4) | 🔥🔥 | Petit |
| 5 | Smoke tests contenu (T12) | 🔥🔥 (protège le reste) | Petit |
| 6 | Mode offseason (T6) | 🔥🔥 | Moyen |
| 7 | Calibration verdicts (T5) | 🔥🔥 | Moyen |
| 8 | Retirer EN (T7) | 🔥 | Petit |
| 9 | Titres dupliqués (T9) | 🔥 | Petit |
| 10 | Émojis → SVG (T8) | 🔥 | Petit |
| 11 | Progression Deal Finder (T10) | 🔥 | Petit |
| 12 | Modal bienvenue (T11) | 🔥 | Petit |
| 13 | Pourquoi un compte (T13) | 🔥 | Petit |

Règles transversales pendant l'exécution : jamais toucher aux poids du score
(`cardScoutScoreMath.js`), UI 100 % FR, vérifier en preview avant de pusher, CI verte
après chaque push, et pour toute retouche visuelle lancer le design skill
(`nouvelle-page` / `ui-ux-pro-max`).
