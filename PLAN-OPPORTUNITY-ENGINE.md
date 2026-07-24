# PLAN-OPPORTUNITY-ENGINE.md — Moteur de deals vérifiés

> **Décision Carlo (2026-07-23)** : « Hottest Deals » ne doit plus être un scrape de 40 gros noms
> qui empile du vide. On repense la SOURCE : un vrai moteur qui scanne large et ne surface que des
> deals **vérifiés sur ventes réelles**, en quantité suffisante pour une vraie vitrine.
>
> **Ce qui est déjà fait** (branche `feat/hottest-deals-refonte`, commits antérieurs) : intégrité
> des cotes (variantes YG, repli broad, customs), curation ruthless (cote fiable + rabais), carte
> direction C (jauge « Payé vs Cote »). Ce plan remplace **d'où viennent les deals**, pas comment
> ils s'affichent.
>
> **Exécution** : skill `loop-iteration`, une tâche/commit, CI verte. Modèle : 🧠 Opus (pipeline/
> logique), ⚡ Sonnet (glue/UI).

---

## Principe directeur (le différenciateur)

**« On ne te montre que des deals qu'on a vérifiés contre de vraies ventes récentes. »**
Pas de cote d'annonces actives gonflée, pas de gros nom sans référence. Chaque carte de la vitrine
= une cote **130point** (ventes réelles) + un prix **sous** cette cote. C'est ça qui donne confiance
et qui aucun « filtre eBay » ne fait.

Conséquence assumée : mieux vaut 15 deals vérifiés que 50 approximatifs. La quantité vient de
**scanner plus de joueurs**, pas de baisser la barre.

---

## Diagnostic de la source actuelle

| | Actuel (`lib/dealsHottest.js`) | Cible |
|---|---|---|
| Bassin | `ELITE_PLAYER_IDS` (~40 noms codés en dur) | Pool dynamique large depuis `player_scores` (top ~150) |
| Scan/joueur | TOUTES les annonces + DeepSeek sur ~15 cartes/joueur | **Focalisé** : la/les cohorte(s) liquide(s) (Young Guns, recrues clés) |
| Cote | cohorte eBay active, 130point en enrichissement optionnel | **130point obligatoire** pour entrer dans la vitrine |
| Coût | lourd (DeepSeek × 15 × 40) | plus léger/carte mais plus de joueurs → **Phase 0 mesure** |
| Résultat | 2 deals aujourd'hui, 70 % de remplissage éliminé | 15-30 deals vérifiés visés |

---

## PHASE 0 — Faisabilité (MESURER avant de bâtir) 🧠

**But** : ne pas construire un moteur qui ne trouve rien. Prototyper le pipeline focalisé sur un
échantillon et mesurer le rendement réel.

### Tâche 0.1 — Spike de rendement
- Script `scripts/spike-opportunities.mjs` (hors app, appelle les libs serveur via un petit runner
  Next route de debug `/api/debug/opportunity-spike` protégée par `CRON_SECRET`, ou directement en
  réutilisant le dev server).
- Prend **N=40 joueurs échantillon** (mix : jeunes stars + recrues récentes depuis `player_scores`).
- Pour chacun : recherche eBay focalisée (Young Guns + recrue clé) → cohorte → **cote 130point**
  (`getSoldPriceStats`/`enrichFairMapWith130Point`) → rabais du listing le moins cher vs cote.
- **Mesure et logge** : (a) nb de joueurs avec ≥1 cote 130point vérifiée ; (b) nb de deals vérifiés
  (rabais ≥ 5 %) ; (c) temps moyen/joueur ; (d) projection temps pour 150 joueurs.
- **Porte de décision** (à écrire dans le plan après le run) :
  - Si ≥ ~1 deal vérifié / 8 joueurs ET 150 joueurs tiennent en < 5 min (budget cron) → **on
    construit Phase 1-5 tel quel**.
  - Sinon → ajuster AVANT de bâtir : élargir les types de cartes liquides (ajouter autos /99 de
    stars, gradées PSA 10 populaires), ou accepter cote « annonces actives » **haute confiance
    uniquement** (≥ 8 comps, spread serré) en complément du 130point, clairement étiquetée.
- **Critère** : un tableau de mesures réel dans le plan + une décision go/adjust documentée. Aucune
  ligne de moteur définitif écrite tant que la porte n'est pas franchie.

> **✅ Fait · 2026-07-23 — VERDICT : AJUSTER (ne pas construire tel quel).**
> Route `app/api/debug/opportunity-spike/route.js` (gated `CRON_SECRET`), scan de 20 puis 50
> joueurs top-score (`getTopStoredScores`).
>
> | Mesure (50 joueurs) | Résultat |
> |---|---|
> | Perf | 1,5 min / 150 joueurs — ✅ tient dans le cron |
> | Couverture 130point | **4/50 (8 %)** — 🔴 très faible |
> | Deals plausibles (−5 % à −40 %) | **0** — 🔴 |
> | « Deals » trouvés | 4, **tous < −40 %** = mismatch de cohorte (garbage) |
> | Young Guns | 0 |
>
> **Causes racines** : (1) 130point ne couvre que ~8 % des cohortes → « vérifié 130point uniquement »
> affame la section ; (2) comparer *l'annonce la moins chère* à la médiane des ventes produit de
> faux −60/−93 % (l'annonce pas chère n'est pas la même carte — mismatch actif↔vendu). Les 2 vrais
> deals existants (Fantilli −26 %, Guenther −15 %) viennent du pipeline **soigné** (comp-matching
> DeepSeek), pas du scan brut. **Conclusion : le scan large + rabais naïf est NON VIABLE.** La
> décision de direction remonte à Carlo (fork ci-dessous) avant toute construction des Phases 1-6.
>
> **Options d'ajustement (à trancher avec Carlo)** :
> - **A** — Scaler le pipeline SOIGNÉ (comp-matching DeepSeek actif↔vendu) sur un pool plus large.
>   Produit des deals propres, mais coût DeepSeek réel ; volume attendu modeste (5-15).
> - **B** — Changer d'univers : cibler recrues récentes / joueurs en montée (marché mal fixé) plutôt
>   que les vétérans top-score (dont les cartes sont déjà à leur prix → 0 deal).
> - **C** — Pivoter la promesse : « intelligence de prix vérifiée » (montrer la valeur marché
>   vérifiée + si les annonces sont au-dessus/dessous) plutôt que la chasse à l'aubaine (rare et
>   bruitée). La valeur = la vérification, pas le steal.
>
> **Les Phases 1-6 ci-dessous sont GELÉES tant que le fork n'est pas tranché.**

---

## PHASE 1 — Bassin de candidats dynamique 🧠

### Tâche 1.1 — Sélecteur de joueurs
- Nouveau `lib/opportunityPool.js` : `getCandidatePlayers({ limit, sport })` → liste depuis
  `player_scores` (jointe à `players` pour âge/GP/headshot). Critères par défaut : score ≥ seuil,
  `games_played ≥ 10`, tri score DESC (tie-break `score DESC, points DESC, player_id ASC` —
  guardrail CLAUDE.md). Limite configurable (~150).
- Remplace l'usage de `ELITE_PLAYER_IDS` dans le pipeline hottest (le garder pour le mode démo/mock
  seulement).
- **Critère** : `getCandidatePlayers({limit:150})` renvoie 150 joueurs pertinents, dédupliqués
  (attention aux tradés dupliqués — voir mémoire `project_nhl_traded_dupes`).

---

## PHASE 2 — Scan focalisé + cote vérifiée 🧠

### Tâche 2.1 — Recherche focalisée par joueur
- `lib/opportunityScan.js` : `scanPlayerForVerifiedDeals(player)` → au lieu de racler toutes les
  annonces, cible les **cohortes liquides** (par défaut Young Guns ; extensible aux types validés
  en Phase 0). Réutilise `fetchEbayHockeyCardListingsForPlayer` + `computeFairValueByFingerprint` +
  `enrichFairMapWith130Point`.
- Ne conserve que les cohortes avec **cote 130point** (`fairValueSource === "130point"`, `scope
  exact`, comps ≥ seuil Phase 0).
- Émet le **listing le moins cher** de chaque cohorte vérifiée, avec le rabais vs cote.
- **Critère** : sur 5 joueurs de test, ne renvoie que des cartes à cote 130point, jamais une cote
  « annonces actives » (sauf si Phase 0 a explicitement autorisé le complément haute-confiance).

### Tâche 2.2 — Scoring léger (coût maîtrisé) 🧠
- Éviter DeepSeek sur des dizaines de cartes × 150 joueurs (coût). Score du deal = combinaison
  déterministe **rabais vérifié × qualité joueur (Card Metrics Score déjà en base)** ; DeepSeek
  réservé (optionnel) au top N final pour la reason. Réutilise `applyPlayerQualityCap`,
  `guardBuyWithoutFairValue`.
- **Critère** : coût DeepSeek borné (≤ ~15 appels/rebuild, pas 600), scores cohérents avec les
  seuils couleur unifiés (6.2).

---

## PHASE 3 — Agrégation, classement, diversité 🧠

### Tâche 3.1 — Construire la vitrine
- `buildVerifiedOpportunities({ cardMode })` : scanne le pool (concurrence bornée), agrège tous les
  deals vérifiés, applique `assignDealRanks` (déjà fait), diversité max 2/joueur, tri ventes réelles
  + rabais. Cap configurable (ex. 24).
- Remplace `buildHottestDealsFresh` (ou le réécrit) en gardant la même forme de payload (la carte C
  ne change pas).
- **Critère** : payload de N deals tous vérifiés 130point ; `assignDealRanks` marque un `isTopDeal`
  mérité ; 0 carte sans cote.

---

## PHASE 4 — Cron, cache, performance ⚡

### Tâche 4.1 — Brancher sur le cron + budget temps
- Le moteur tourne dans `/api/cron/hottest` (déjà `maxDuration: 300`). Régler la **concurrence** du
  scan pour tenir < 5 min sur 150 joueurs (mesures Phase 0). Chunking si nécessaire.
- Cache Blob/Supabase comme aujourd'hui (bump version). Stale-while-revalidate conservé → utilisateur
  toujours instantané.
- **Critère** : un run cron local complet < 5 min ; le front sert le cache en < 1 s.

### Tâche 4.2 — Garde-fou « peu de deals » ⚡
- Si un jour < ~6 deals vérifiés : la section reste honnête (« X deals vérifiés aujourd'hui ») sans
  padding. Header enrichi : « Deals vérifiés sur ventes réelles · N aujourd'hui · maj il y a Xh ».
- **Critère** : jamais de carte de remplissage ; le compte reflète la réalité.

---

## PHASE 5 — Finitions vitrine ⚡

### Tâche 5.1 — Copie & preuve
- Renommer/recadrer la section autour de la promesse : « Deals vérifiés » plutôt que « Hottest »
  (à valider avec Carlo). Sous-titre qui explique la garantie (ventes réelles 130point).
- Carte direction C déjà en place ; s'assurer que la preuve « ventes réelles · N comparables ·
  dernière vente il y a Xj » est toujours présente (elle vient de 130point → garantie).
- **Critère** : un consommateur suspicieux comprend en 3 s pourquoi c'est fiable.

---

## PHASE 6 — Vérification 🧠

### Tâche 6.1 — `verify-cardmetrics` complet
- `test:cohorts` + lint + build + smoke. Audit programmatique : 100 % des cartes de la vitrine ont
  `fairValueSource === "130point"` + rabais ; 0 sans cote ; badge top mérité ; mobile 375px.
- Audit manuel de 10 deals contre 130point/eBay (le test de confiance ultime).
- **Critère de fin** : la vitrine affiche N (≥ objectif Phase 0) deals, tous vérifiables à la main,
  chargement instantané via cache, rien qui ressemble à un dump eBay.

---

## Risques & garde-fous

- **Coût eBay/DeepSeek** : Phase 0 borne le rendement AVANT de scaler ; DeepSeek plafonné (2.2).
- **130point rate-limit/scraping** : déjà caché 24h (`soldPrices.js`) ; concurrence bornée ; jamais
  proposer l'API sold eBay (morte — mémoire `feedback_ebay_sold`).
- **Temps cron** : mesuré Phase 0, chunking Phase 4.
- **Honnêteté** : si le moteur ne trouve pas assez, on l'assume (4.2) — jamais de padding.
- **Ne pas casser l'acquis** : la carte C, l'intégrité des cotes et le harnais `test:cohorts`
  restent la référence ; ce plan ne touche que la SOURCE des deals.
