# PLAN-OPPORTUNITY-ENGINE.md — Moteur de « Meilleurs investissements »

> **Vision Carlo (2026-07-23)** : la section ne doit pas chasser l'aubaine (« sauver 4 $ ») mais
> surfacer **les meilleurs INVESTISSEMENTS** : un joueur avec un solide score + du potentiel, un
> type de carte qui prend de la valeur, à un **prix vérifié** qu'on ne surpaie pas. La valeur, c'est
> l'intelligence de prix vérifiée, pas le steal.
>
> **Exécution** : skill `loop-iteration`, une tâche/commit, CI verte. 🧠 Opus (pipeline), ⚡ Sonnet (UI/glue).

---

## Principe directeur

**« Les cartes qui valent la peine d'être achetées maintenant — bons joueurs, cartes qui montent,
prix vérifié. »**
Un bon investissement n'a pas besoin d'être une aubaine rare : il lui faut (1) un joueur de qualité
avec de l'upside, (2) un type de carte qui s'apprécie (Young Guns, auto/RPA, numéroté, gradée, SPx/
Premier), (3) un prix **au marché ou en dessous** (jamais surpayé), vérifié contre les cotes réelles.

---

## PHASE 0 — Faisabilité ✅ Fait · 2026-07-23

### 0.1 — Direction « aubaines vérifiées 130point » → **REJETÉE**
Scan 50 joueurs top-score : couverture 130point **8 %**, **0 deal plausible**, tous les « deals »
< −40 % = mismatch actif↔vendu. Perf OK (1,5 min/150) mais le rendement est nul. Cause : 130point
ne couvre presque rien, et « annonce la moins chère vs médiane vendue » produit du faux −90 %.

### 0.2 — Direction « meilleurs investissements » → **GO**
Même route (`app/api/debug/opportunity-spike/route.js`), critère investissement : type qui s'apprécie
+ cote active fiable (≥4 comps) + une annonce ≤ 110 % du marché.

| Mesure (50 joueurs) | Résultat |
|---|---|
| Couverture | **70 %** des joueurs ont ≥1 candidat |
| Candidats | **60** (1,2 / joueur) |
| Perf | **0,6 min / 150 joueurs** (cotes actives, pas de 130point) |
| Échantillon | Carlsson Auto (7,5), Demidov SPx (7), Slafkovský (7,6), Dahlin YG (6,9)… |

**Verdict** : inventaire abondant et de qualité. On construit sur cette direction. **Raffinements
identifiés par le spike** : (a) l'« annonce la moins chère » reste bruitée (outliers à −90 % =
carte abîmée/différente) → utiliser un prix **représentatif** (pas le min absolu) et un **plancher
de prix** (~15-20 $, un actif à 1,39 $ n'est pas un investissement) ; (b) le score joueur + le type
priment sur le rabais.

---

## PHASE 1 — Bassin de qualité avec upside 🧠

### Tâche 1.1 — Sélecteur de candidats
- `lib/opportunityPool.js` : `getInvestmentCandidatePlayers({ limit })` depuis `player_scores`
  (`getTopStoredScores` élargi, full-scores only), joint `players` pour âge/GP. Défaut ~120.
- Le **Card Metrics Score encode déjà l'upside** (âge, momentum, accélération) → tri par score suffit,
  mais on garantit une part de **jeunes** (âge ≤ 25) pour l'appréciation long terme.
- Déduplication tradés (mémoire `project_nhl_traded_dupes`). `ELITE_PLAYER_IDS` ne sert plus qu'au mock.
- **Critère** : ~120 candidats pertinents, dédupliqués, mix jeunes/établis.

---

## PHASE 2 — Scan investissement (coût maîtrisé) 🧠

### Tâche 2.1 — Détection des candidats par joueur
- `lib/opportunityScan.js` : `scanPlayerInvestments(player)` → cohortes de **types qui s'apprécient**
  avec **cote active fiable** (≥4 comps) ; prix de référence = un listing **représentatif** (ex.
  P10–P25 de la cohorte, pas le min outlier) ; garde ceux **≤ 110 % du marché** et **≥ plancher prix**.
- Réutilise `fetchEbayHockeyCardListingsForPlayer`, `computeFairValueByFingerprint`. 130point en
  **bonus** (badge « ventes réelles » quand dispo) mais **non requis**.
- **Critère** : sur 5 joueurs test, ne renvoie que des cartes d'appréciation à prix ≤ marché, ≥ plancher,
  sans outlier à −90 %.

### Tâche 2.2 — Score d'investissement SANS exploser DeepSeek 🧠
- Scan large = **score heuristique** (`mockInvestmentScores` déjà : blend prix × qualité joueur) +
  `applyPlayerQualityCap`. **DeepSeek réservé au top N final** (ex. 24) pour la reason/affinage —
  pas 120 × 15 appels. Réutilise les garde-fous existants (6.2 couleurs, B4).
- **Critère** : ≤ ~24 appels DeepSeek / rebuild ; scores cohérents.

---

## PHASE 3 — Agrégation & classement 🧠

### Tâche 3.1 — `buildInvestmentPicks({ cardMode })`
- Scanne le pool (concurrence bornée), agrège, trie par **investmentScore** (qualité joueur × type ×
  prix vérifié), diversité max 2/joueur, cap ~24. `assignDealRanks` → badge « MEILLEUR CHOIX ».
- Remplace `buildHottestDealsFresh`, même **forme de payload** (la carte C ne change pas de contrat).
- **Critère** : ~15-24 picks, tous type d'appréciation + prix ≤ marché + score plancher ; 0 « cote
  indisponible ».

---

## PHASE 4 — Cron, cache, perf ⚡

### Tâche 4.1 — Brancher + budget
- Tourne dans `/api/cron/hottest` (`maxDuration 300`). Concurrence réglée (Phase 0 : 0,6 min/150 en
  heuristique + top-N DeepSeek → large marge). Cache bump. Stale-while-revalidate conservé.
- **Critère** : rebuild local < 3 min ; front < 1 s.

---

## PHASE 5 — Recadrage vitrine (copie + carte) ⚡

### Tâche 5.1 — La promesse à l'écran
- Renommer la section : **« Meilleurs investissements »** (ou « Smart Buys ») + sous-titre « bons
  joueurs · cartes qui montent · prix vérifié ». (Valider le libellé avec Carlo.)
- Carte direction C : la jauge « Payé vs Cote » montre **le prix vérifié** (au marché / en dessous) ;
  quand il y a un rabais → « X sous le marché », quand c'est au prix → **« au prix du marché ·
  vérifié »** (pas un faux deal). Le badge/score porte l'angle investissement (upside + type).
- **Critère** : un consommateur comprend en 3 s POURQUOI c'est un bon achat (joueur + type + prix juste),
  pas « sauve 4 $ ».

### Tâche 5.2 — Modal = thèse d'investissement ⚡
- Le modal (déjà 3 jauges Joueur/Prix/Type) devient la **thèse** : pourquoi ce joueur (score +
  upside), pourquoi ce type (appréciation), pourquoi ce prix (vérifié). Réutilise `buildScoreFactors`.
- **Critère** : la thèse tient sans jargon, décision en 5 s.

---

## PHASE 6 — Vérification 🧠

### Tâche 6.1 — `verify-cardmetrics` complet
- `test:cohorts` + lint + build + smoke. Audit programmatique : 100 % des picks = type d'appréciation
  + cote fiable + prix ≤ ~110 % + score ≥ plancher ; 0 sans cote ; 0 outlier ; badge mérité ; mobile.
- Audit manuel de 10 picks (le vrai test : « est-ce que J'ACHÈTERAIS ça comme investissement ? »).
- **Critère de fin** : la vitrine affiche ~15-24 investissements crédibles, chargement instantané, et
  donne envie d'acheter pour les bonnes raisons.

---

## Garde-fous
- **Coût** : heuristique en large, DeepSeek plafonné au top N (2.2). 130point en bonus, pas requis.
- **Honnêteté** : prix toujours vérifié contre une cote réelle ; jamais surpayé présenté comme un
  bon achat ; plancher de prix (pas de « carte » à 1,39 $ comme « investissement »).
- **Acquis préservé** : intégrité des cotes, harnais `test:cohorts`, carte C — inchangés.
- **Nettoyage** : retirer la route debug `opportunity-spike` (ou la garder gated) en fin de build.
