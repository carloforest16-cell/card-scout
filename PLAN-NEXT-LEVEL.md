# CARD METRICS — PLAN "NEXT LEVEL"

> **Document d'exécution pour agent en loop.** Rédigé le 2026-07-02 après revue complète du site (23 pages, ~60 routes API, 38 modules lib). Chaque itération de la loop : exécuter **UNE tâche**, la vérifier, la commiter, cocher la case, s'arrêter.

---

## 0. MISSION (à garder en tête pour CHAQUE décision)

Card Metrics = **un analyste de marché IA pour cartes de hockey NHL**. Le **Card Metrics Score est la colonne vertébrale** — toute feature doit répondre à : *"est-ce que ça rend le score plus utile, crédible ou actionnable ?"* Sinon c'est secondaire, voire à supprimer.

Le différenciateur vs concurrents (CardHedge etc.) : **on ne montre pas juste des prix, on donne un verdict** (Acheter / Surveiller / Passer). La crédibilité du verdict est le produit. Tout ce qui érode la crédibilité (fake data, prix flous, features à moitié fonctionnelles) est un bug de mission, pas juste un bug technique.

**Ennemis du produit actuel** identifiés dans cette revue :
1. **Données synthétiques présentées comme réelles** (dashboard surtout) — tue la confiance.
2. **Prix sans provenance ni fraîcheur** — "cote" affichée sans dire d'où elle vient ni de quand.
3. **Pages orphelines / features en double** — dilue l'expérience.
4. **Dashboard sous-exploité** — c'est le hub du user connecté, il doit être la page la plus actionnable du site.

---

## 1. PROTOCOLE DE LOOP (obligatoire, lis à chaque itération)

1. Trouve la **première tâche `[ ]` non cochée** dans l'ordre du document (Phase 0 → 6).
2. Lis les fichiers concernés AVANT de coder. Vérifie que la tâche est toujours pertinente (le code a pu bouger).
3. Exécute la tâche **complètement** (pas de moitié de tâche).
4. **Vérification obligatoire** avant de conclure :
   - `npm run lint` → zéro nouvelle erreur.
   - Preview sur **port 3001** (`.claude/launch.json`, config `card-scout`) : page concernée sans erreur console, testée aussi à 375px (pas de scroll horizontal).
   - Si la tâche touche une API : appeler la route et vérifier le payload.
5. Mets à jour ce fichier : `[x]` + date + une ligne de note (ex. `[x] 2026-07-03 — fait, +note éventuelle`). Si une tâche s'avère obsolète/impossible, coche avec `[~]` et explique pourquoi.
6. Commit : `feat(scope): description` ou `fix(scope): ...` — un commit par tâche, inclure la mise à jour du plan dans le commit. **Ne pas push sans instruction.**
7. **STOP** — une seule tâche par itération.

### Garde-fous permanents
- **JAMAIS de fake data présentée comme réelle.** Si la vraie donnée n'existe pas : état vide honnête ("en construction", "données insuffisantes") ou masquer le widget.
- UI 100% **français** (fr-CA). Prix en CAD par défaut.
- IA = **DeepSeek uniquement** (`deepseek-chat`), jamais d'appel Anthropic.
- **Ne pas modifier les poids du score** (`cardScoutScoreMath.js`) sauf tâche explicite.
- Respecter `prefers-reduced-motion` sur toute animation. Pas d'emojis comme icônes (SVG/lucide).
- **Ne pas réintroduire le grain cinéma** (`.hw-grain`, retiré à la demande de Carlo).
- Pas de nouvelle dépendance lourde sans nécessité (framer-motion + lucide-react déjà là, ça suffit pour 95% des cas).
- Avant tout redesign de page, lancer le skill design :
  `python .claude/skills/ui-ux-pro-max/scripts/search.py "<type de page> <mots-clés>" --design-system -p "Card Metrics"`
- eBay ne fournit PAS les prix vendus (API morte). Les sold comps viennent de **130point** (`lib/soldPrices.js`, scraping, cache 24h). Ne jamais proposer l'API eBay sold.

### Pièges connus du codebase (vérifiés, ne pas re-découvrir)
- `.hc-page { overflow-x: hidden }` **casse `position: sticky`** → corrigé en `overflow-x: clip` dans `home-wow.css`. Si sticky ne marche pas sur une autre page, chercher un `overflow-x: hidden` sur un ancêtre et remplacer par `clip`.
- `.hc-hero > *:not(.hc-hero-video)` force `position: relative` sur les enfants directs du hero home → tout enfant `absolute` a besoin d'un sélecteur plus spécifique (`.hc-hero > .ma-classe`).
- `AnimatePresence mode="wait"` de framer-motion peut rester bloqué (contenu jamais affiché). Pour du texte qui doit être visible à coup sûr : **animation CSS pure** (`@keyframes` + changement de `key` React), comme `.hft-active-step` dans `home-feature-tabs.css`.
- En preview automatisée, `document.hidden === true` gèle les animations JS et CSS — vérifier la présence DOM/le contenu, pas l'opacité mid-animation.
- Identifiants internes `cardScout*` = intentionnel (brand = Card Metrics côté visible). Ne pas renommer.
- Pas de suite de tests. `npm run lint` est le seul filet + vérif manuelle preview.

### Design system (tokens existants — ne rien inventer)
- Couleurs : `--void` (fond), `--platinum`, `--silver`, `--ghost` (textes), `--ice` #00d4ff (accent principal), `--gold` #ffb61e, `--profit` vert, `--loss` rouge, `--border-cn`, `--surface`, `--abyss`.
- Fonts : `--cn-hero` (display Bebas-like), `--cn-display`, `--cn-body`, `--cn-mono`.
- Primitives : `cn-btn`, `cn-badge` (`--profit`/`--warn`), `cn-eyebrow`, `cn-card`, `cn-h1/h2`, composants `Reveal`, `TiltCard`, `Skeleton`, `SpotlightCard`.
- Patterns WOW de la home à réutiliser : mots masqués qui montent (`SplitWords` dans `HomeCinematic.js`), compteur `CountUp`, `hw-btn-shine` (balayage lumineux), scroll reveals natifs `animation-timeline: view()` (progressive enhancement dans `home-wow.css`), section épinglée (`ScrollStory.js`), mockups navigateur avec chrome (`hc-score-mock__chrome`).

---

## PHASE 0 — Hygiène (faire en premier, une itération)

- [x] **0.1 — Commit propre du travail en attente.** 2026-07-02 — fait. 6 commits logiques créés sur `feat/admin-mission-control` (build + lint vérifiés avant/après, zéro nouvelle erreur, rien pushé) : (1) `feat(home)` refonte WOW complète (hero, ScrollStory, WowFx, marquee, stepper) ; (2) `feat(admin)` métriques business + analytics pageviews Mission Control ; (3) `feat(analytics)` tracking pageviews (PageTracker + /api/track) ; (4) `feat(deals)` fingerprint de carte + ventes réelles 130point (dealFinder, soldPrices, auctionDeals, cardNumberExtractor, EncheresClient) — séparé du score car thème distinct ; (5) `feat(score)` décroissance hors-saison momentum/teamContext (cardScoutScore.js) — également séparé, thème indépendant du fingerprint ; (6) `docs` ce plan lui-même. Bonus hygiène : ajout de `__pycache__/`/`*.pyc` au `.gitignore` (dossier généré par le skill ui-ux-pro-max qui traînait en `??`).

---

## PHASE 1 — DASHBOARD (priorité #1 : la page du user connecté)

**État actuel** (`app/dashboard/DashboardClient.js`) : onboarding 3 étapes correct pour nouveau user, mais pour un user actif : deltas de watchlist **générés par un seed synthétique** quand les snapshots manquent, widget "Pouls du marché" avec **fallback hardcodé** ("Recrues 2024 +12.4%"...), sparkline **simulée**, KPI "Picks IA = 10" statique. L'API `/api/dashboard/summary` existe et est déjà bien faite (cache 5 min, deltas réels via `player_scores_history`, opps du cache top-10). Le problème est surtout côté client : le fake masque le vrai.

**Vision cible** : le dashboard répond en 10 secondes à *"qu'est-ce que je devrais faire aujourd'hui ?"* — briefing personnalisé, deals détectés pour MES joueurs, mouvements de MES scores, état de MON portfolio. Zéro donnée inventée.

- [x] **1.1 — Purge des données synthétiques.** 2026-07-02 — fait. Backend (`/api/dashboard/summary/route.js`) : ajout d'un fallback honnête sur `player_scores` (score courant réel, `hasHistory:false`) pour tout joueur watchlist sans snapshot historique — remplace l'ancien seed synthétique client ; `buildPortfolioSparkline` réécrite sans aucune donnée simulée (fonction `buildSynthetic` supprimée), retourne désormais `daysTracked`/`daysTarget` pour une barre de progression honnête ; ajout de `oppsCount` (vrai total top-10, pas de slice) et `oppsGeneratedAt` (`fetched_at` du cache `cache_generic`, requête ajustée pour le sélectionner). Front (`DashboardClient.js`) : `WatchlistWidget` affiche le score réel + "en observation" (pas de delta inventé) quand pas d'historique ; `MarketPulseWidget` retourne `null` si le payload est vide/absent (fallback hardcodé supprimé) ; `PortfolioWidget` affiche un nouveau composant `TrackingProgress` (barre + "jour X/30") tant que `sparklineNote !== "real"`, sinon le vrai Sparkline ; KPI "Picks IA" utilise `oppsCount` réel + `formatRelativeTime(oppsGeneratedAt)` (`lib/timeFormat.js`) au lieu de "10"/"rafraîchi 7j" statiques. CSS ajoutée pour la barre de progression + `white-space: nowrap` sur le chip delta watchlist (le libellé "en observation" est plus long que "±0"). Vérifié : build + lint propres (zéro nouvelle erreur), lecture complète du diff, layout watchlist confirmé résistant au texte plus long (`.dash-watch__info` a `min-width:0` + ellipsis). **Limite de vérification** : impossible de tester visuellement le dashboard authentifié en preview (pas d'identifiants de test disponibles pour cette session) — vérifié que `/api/dashboard/summary` répond 401 proprement (pas de crash serveur) en non-authentifié. À confirmer visuellement par Carlo à la prochaine connexion réelle.

- [ ] **1.2 — Widget "Deals pour ta watchlist" (le plus actionnable du site).** Nouveau widget en position #1 du dashboard. Backend : dans `/api/dashboard/summary`, croiser les `player_id`/`player_name` de la watchlist avec (a) le cache hottest deals (`dealsHottest`/cache `cache_generic`) et (b) les caches deals par joueur existants (clés du dealFinder dans `cache_generic`) — **ne PAS déclencher de fetch eBay à la volée** (trop lent/coûteux), seulement lire les caches. Retourner max 4 deals `{playerName, groupType, priceCad, investmentScore, verdict, percentOfMarket, url, cachedAt}`. Front : rangées avec badge verdict (`cn-badge`), prix, "−X% vs cote", lien eBay affilié (`lib/ebayAffiliate.js`), et l'âge de la donnée ("détecté il y a 3h"). État vide honnête : "Aucun deal en cache pour tes joueurs — lance une recherche" + lien `/deals`.

- [ ] **1.3 — Briefing du jour (hero).** Remplacer le sous-titre générique du hero par un brief personnalisé généré côté serveur SANS appel IA à chaque vue : dans `/api/dashboard/summary`, composer 1-2 phrases à partir de règles sur les données déjà chargées (plus gros mouvement de score watchlist, P&L portfolio 7j, nb de deals détectés, prochain refresh top-10). Ex : *"Caufield a gagné +0.4 cette semaine. 2 deals sous la cote détectés pour tes joueurs. Ton vault : +3.2% sur 7 jours."* Template déterministe (pas DeepSeek — gratuit, instantané, toujours vrai). Cacher dans le payload summary existant.

- [ ] **1.4 — Feed d'activité.** Remplacer le KPI strip statique du bas par un flux chronologique compact (max 8 items) : alertes prix déclenchées, changements de score notables (|delta 7j| ≥ 0.3) des joueurs suivis, nouveaux picks hebdo. Sources : `price_alerts` (statut déclenché), `player_scores_history`, `notifications` (la table/route existe : `/api/notifications`). Chaque item : icône, texte, timestamp relatif ("il y a 2h"), lien. Si vide : masquer la section.

- [ ] **1.5 — KPIs réels.** KPI strip : (a) "Valeur portfolio" → utiliser `/api/portfolio/value` (valeur estimée + P&L %, tone up/down) au lieu de `totalInvested` sans contexte ; (b) "Score moyen watchlist" avec delta 7j moyen (calculable depuis `deltas`) ; (c) "Alertes actives" (existant, ok) ; (d) "Prochain refresh picks" → countdown vers le prochain 1er/15 du mois (les crons opportunites tournent ces jours-là). Chaque KPI cliquable vers sa page.

- [ ] **1.6 — Design pass dashboard.** Aligner sur le niveau de la home : titre hero avec `SplitWords` (léger, 2-3 mots), reveals au scroll (réutiliser le pattern `animation-timeline: view()` de `home-wow.css` via une classe partagée), hover states sur toutes les cartes (translateY −2/−4px + glow border ice comme `.hc-transparence-card`), skeletons cohérents pendant le fetch summary (composant `Skeleton` existant), vérifier 375px. Lancer le skill design (`"saas dashboard dark analytics"`) avant. Ne pas alourdir : le dashboard doit rester rapide et dense, pas cinématique.

- [ ] **1.7 — Portfolio Health intégré.** La route `/api/portfolio/health` existe déjà. L'afficher dans le dashboard : score de santé (0-100 ou lettre) + 1 recommandation principale du coach (`/api/portfolio/coach`, déjà existant), dans le widget portfolio. Lazy-load (fetch après le summary) pour ne pas ralentir le premier paint.

---

## PHASE 2 — LOGISTIQUE DES PRIX (crédibilité = produit)

**État actuel** : deux sources de vérité concurrentes — annonces actives eBay (`ebayServer.js`, conversion USD→CAD **hardcodée ×1.37**) et sold comps 130point (`soldPrices.js`, médiane ≥3 ventes, fenêtre 120j, cache 24h). Les pages affichent "cote" / "vs cote" / "valeur marché" sans jamais dire laquelle des deux, ni la fraîcheur, ni la taille d'échantillon. C'est LE point faible de crédibilité.

- [ ] **2.1 — `lib/marketValue.js` : source de vérité unique.** Créer un module central qui, pour un (joueur, cohorte/groupType), retourne `{ valueCad, source: "sold"|"asking", sampleSize, asOfIso, confidence: "high"|"medium"|"low" }` avec hiérarchie : médiane sold comps 130point si ≥3 ventes < 120j (`confidence: high` si ≥5, sinon medium) → sinon médiane des annonces actives de la cohorte (`source: "asking"`, `confidence: low`). Refactorer les consommateurs pour l'utiliser : `dealFinder.js` (calcul du percentOfMarket), `analyzeListing.js` (cote affichée sur /analyse), `portfolioValue.js` (valorisation vault), `auctionDeals.js` (valeur estimée des enchères). **Aucun changement d'UI dans cette tâche** — juste le refactor backend avec le même comportement par défaut, en exposant les métadonnées. Vérifier que /deals, /analyse, /portfolio retournent les mêmes ordres de grandeur qu'avant.

- [ ] **2.2 — Provenance visible partout.** Créer un petit composant `PriceProvenance` (badge/tooltip) : `source: "sold"` → "Cote : ventes réelles (12) · maj il y a 3h" (ton vert/ice) ; `source: "asking"` → "Cote estimée : annonces actives" (ton neutre + icône info). L'ajouter partout où une cote/valeur marché est affichée : cartes deals (/deals), /analyse (grille PRIX/COTE), /encheres (valeur estimée), /portfolio (valeur estimée par carte), tooltips des mockups si pertinent. Mobile : version courte ("ventes réelles · 3h").

- [ ] **2.3 — Taux de change dynamique.** Remplacer le `USD_TO_CAD = 1.37` hardcodé (présent dans `ebayServer.js` ET `soldPrices.js`) par `lib/fxRate.js` : fetch d'un taux USD→CAD (Banque du Canada Valet API `https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1`, gratuit sans clé), cache 24h dans `cache_generic`, fallback 1.37 si échec. Un seul import partagé.

- [ ] **2.4 — Uniformisation du format des deltas prix.** Audit de tous les affichages "% vs cote" (deals, encheres, hottest, analyse, home mockups) : même convention partout — signe explicite (−22% = sous la cote = bon pour acheteur, en vert/profit ; +X% = au-dessus, rouge/neutre), arrondi entier, libellé identique "vs cote". Créer un helper `formatVsMarket(pct)` dans `lib/utils.js` et l'utiliser partout. Corriger les incohérences trouvées.

- [ ] **2.5 — Fraîcheur des prix.** Toute donnée prix affichée > 24h d'âge reçoit une étiquette discrète "données du <date>" ; > 72h → ton warning + éviter de la présenter dans les widgets "temps réel" (LiveSection, hottest). Ajouter `cachedAt`/`asOf` aux payloads qui ne l'exposent pas encore (deals hottest, auctions, trending). Front : helper `formatAgo` existe déjà dans `HomeCinematic.js` → le déplacer dans `lib/timeFormat.js` (qui existe) et réutiliser.

---

## PHASE 3 — LOGISTIQUE DU SCORE (le cœur — le rendre irréprochable)

**État actuel** : score v7.1, 13 facteurs pondérés (Performance 14%, Momentum 10%, Accélération 8%, Âge 10%, Marché 10%, Liquidité 4%, Upside 14%, Hype 7%, Discrépance 5%, Risque 5%, Catalyseurs 6%, Social 3%, Équipe 4%). Les 4 sous-scores avancés tournent via cron `enrich-scores` quotidien — un score frais de la journée peut être "de base" (sans les 4 avancés) sans que l'utilisateur le sache. L'explicabilité (narratif + chat "convaincs-moi" + `/api/score/explain`) existe mais est peu mise en avant. Le backtest public existe (`/backtest`) mais est orphelin.

- [ ] **3.1 — Poids du score : une seule source de vérité.** Les poids sont affichés à plusieurs endroits avec des valeurs DIFFÉRENTES et périmées (ex. home `ScoreMock` affiche "Performance 20%, Momentum 20%..." ; `ScrollStory.js` affiche les bons ; les textes de sections en listent d'autres). Exporter un objet `SCORE_WEIGHTS` (label fr, poids, clé) depuis `cardScoutScoreMath.js` (ou `sportConfig.js` si c'est là que vivent les poids) et générer TOUS les affichages de poids depuis cet export. Auditer : home (mockups + textes), /player, /opportunites, ScrollStory, HomeFeatureTabs. Critère : `grep` d'un poids en dur (ex. "14%") ne matche plus que la source unique.

- [ ] **3.2 — Badge de complétude du score.** Exposer dans le payload score (route `/api/score` + `player_scores`) un flag `enriched: boolean` (les 4 sous-scores avancés présents ?) et `computedAt`. UI : sur /player et partout où le score s'affiche en grand, badge "Score complet · maj il y a 6h" vs "Score de base · enrichissement cette nuit" (tooltip expliquant les 4 facteurs qui arrivent). Honnêteté = crédibilité.

- [ ] **3.3 — Deltas de score partout.** Le delta 7j (déjà calculé pour le dashboard via `player_scores_history`) doit apparaître à côté de CHAQUE score joueur affiché : /opportunites (cartes top-10), /deals (chip score joueur), trending carousel, /pulse, page player (déjà ?). Créer un helper backend `getScoreDeltas(playerIds)` réutilisable (extraire la logique de `/api/dashboard/summary`) + un composant `ScoreDelta` (flèche + valeur, tones up/down/flat, "nouveau" si pas d'historique). Attention perf : batcher par page, jamais un appel par carte.

- [ ] **3.4 — Explicabilité mise en avant sur /player.** Restructurer la section score de la page joueur en 3 onglets/segments clairs : **Facteurs** (les 13 barres + poids), **Pourquoi ça bouge** (narratif temporel existant + delta history en mini-graphe depuis `player_scores_history`), **Convaincs-moi** (le chat existant). Un seul appel par onglet, lazy. Le but : un sceptique comprend le score en 30 secondes.

- [ ] **3.5 — Backtest comme preuve sociale.** /backtest est orphelin (aucun lien entrant repéré). L'intégrer : lien "Le score est-il fiable ? Voir le backtest" depuis (a) la section score de /player, (b) la section Transparence de la home (carte "Moteur IA"), (c) le footer. Sur /backtest : vérifier que la page tient debout (données réelles, design cohérent) ; si la couverture est encore trop faible (~6 joueurs selon le backlog), afficher le disclaimer de couverture clairement plutôt que cacher la page.

- [ ] **3.6 — Score des annonces : montrer le raisonnement.** Sur /deals, le score IA 0-10 par annonce (DeepSeek) est affiché sans justification. Le payload de `dealInvestmentScore.js` contient (ou peut contenir à coût nul) verdict + raison courte. Afficher au hover/tap une ligne de raisonnement ("RC gradée sous la cote, joueur en momentum") + le hold timeline si présent. Si la raison n'existe pas dans le payload actuel, l'ajouter au prompt DeepSeek (1 phrase max, français) sans augmenter le nombre d'appels.

---

## PHASE 4 — DESIGN ROLLOUT (étendre le niveau "home" au reste du site)

**Règle générale** : la home est cinématique (vitrine) ; les pages outils (/deals, /dashboard, /player...) doivent être **premium mais denses et rapides** — reveals subtils, hover soignés, hiérarchie typographique, états vides/chargement travaillés. Pas de section épinglée ni de marquee sur les pages outils.

- [ ] **4.1 — Extraire les primitives WOW réutilisables.** Créer `app/components/wow/` : `SplitWords.js` (extrait de HomeCinematic), `CountUp.js` (idem), classe CSS partagée `.wow-rise` (scroll reveal `animation-timeline: view()` avec fallback Reveal JS), `.wow-btn-shine`, `.wow-card-hover` (lift + glow ice). Remplacer les usages home par les imports partagés. Zéro changement visuel — pure factorisation. C'est le prérequis des tâches 4.2+.

- [ ] **4.2 — Design pass /deals.** La page la plus utilisée. Skill design d'abord (`"marketplace search results dark"`). Améliorer : header de résultats avec compteur animé (CountUp) "12 annonces · 3 deals prioritaires", groupes de cartes avec en-têtes sticky pendant le scroll de la liste, hover cartes (wow-card-hover), skeletons pendant la recherche (structure exacte des cartes, pas des blocs gris génériques), état vide avec suggestions de joueurs populaires (depuis trending cache), transition d'apparition des résultats en stagger. Vérifier le mode compare côte à côte reste fonctionnel. Mobile 375px impeccable (cartes empilées, filtres accessibles).

- [ ] **4.3 — Design pass /player/[id].** La page "fiche produit" du score. Hero joueur : headshot + nom en SplitWords léger + score en CountUp avec l'anneau/jauge, badges delta + complétude (tâches 3.2/3.3 déjà faites à ce stade). Sections en reveals. Mini-graphe historique du score (SVG simple depuis `player_scores_history`, pas de lib de chart). Deals du joueur en bas avec les provenances prix (2.2). C'est la page à partager — soigner aussi l'OG image (route `/api/og/player/[id]` existe, vérifier qu'elle reflète le design actuel).

- [ ] **4.4 — Design pass /opportunites.** Le top-10 est un produit phare. Présentation en "classement" assumé : rang #1-10 en gros (`--cn-hero`), delta de rang vs édition précédente si dispo, thèse IA mise en valeur (typographie citation), CTA clair par carte (voir deals du joueur). Compteur "prochaine édition dans X jours" (refresh 1er/15). Reveals en stagger.

- [ ] **4.5 — Design pass /encheres + /pulse.** Encheres : les timers doivent créer l'urgence — countdown mono qui passe en gold < 1h, en rouge < 10min ; tri par score d'urgence visible. Pulse : c'est un feed — timestamps relatifs, icônes par type d'événement, auto-refresh doux (poll 60s avec indicateur "live" pulsant). Les deux : reveals, hover, mobile.

- [ ] **4.6 — Design pass /analyse.** L'outil "colle une URL" : le moment d'attente est le moment critique — remplacer le spinner par une séquence de progression narrative ("Lecture de l'annonce… → Identification du joueur… → Calcul de la cote… → Verdict") calée sur les vraies étapes si le backend le permet, sinon simulée MAIS étiquetée comme étapes d'analyse (pas des fausses données, juste du feedback de progression). Résultat : verdict en stamp (réutiliser le style `.hs-ph__stamp` de ScrollStory), grille de données avec provenance prix.

- [ ] **4.7 — Cohérence navigation + footer.** Audit de `AppNav` : état actif correct sur chaque page, breadcrumb ou titre de page cohérent, le footer de la home (liens) présent/cohérent sur toutes les pages (ou décision explicite de ne pas en avoir sur les pages outils). Ajouter les liens orphelins décidés en 3.5 et 5.x. Vérifier tous les liens du footer/nav mènent quelque part (pas de 404).

- [ ] **4.8 — Audit mobile global.** Passe systématique 375px sur : home, dashboard, deals, player, opportunites, encheres, pulse, analyse, portfolio, watchlist. Checklist par page : pas de scroll horizontal, touch targets ≥44px, textes ≥16px pour le body, bottom nav fonctionnelle, modales utilisables. Corriger ce qui est trouvé. Documenter dans la note de la tâche ce qui a été corrigé.

---

## PHASE 5 — ÉLAGAGE & CONSOLIDATION (moins mais mieux)

**Constat** : 23 pages, plusieurs se recoupent ou sont orphelines. Un site avec 6 features excellentes > 12 features moyennes. Pour chaque suppression : redirect 301 (`next.config` ou page avec `redirect()`), retirer du sitemap, retirer les liens entrants.

- [ ] **5.1 — Supprimer /grading.** Déjà retiré de la nav/footer/sitemap (PSA/TAG ont fermé les soumissions). La page existe encore → supprimer `app/grading/`, redirect 301 vers `/analyse`. Vérifier qu'aucun composant ne l'importe.

- [ ] **5.2 — Fusionner /compare dans /deals.** Deux entrées pour comparer des joueurs (page `/compare` + mode compare de `/deals`). Garder LE mode /deals (déjà intégré au flux de recherche), rediriger `/compare` → `/deals`, migrer ce que /compare fait de mieux (si quelque chose) dans le mode deals. Retirer `/api/compare/player` si plus consommé (vérifier d'abord au grep).

- [ ] **5.3 — Consolider les canaux de notifications.** Quatre surfaces se recoupent : `/alertes`, `/notifications`, `/digest`, `/picks` (+ préférences dans `/parametres`). Cible : **/notifications** = centre unique in-app (alertes prix déclenchées + notifs) ; **/picks** reste (c'est du contenu, pas un canal) ; **/digest** et **/alertes** → leurs réglages migrent dans `/parametres` (section "Emails & alertes"), pages redirigées. Faire un audit d'usage d'abord (grep des liens entrants) et ajuster la cible si une page est en fait déjà morte.

- [ ] **5.4 — Nettoyer HomeCinematic.js.** ~700 lignes de sections définies mais non rendues (LiveSection, AhaMomentSection, FeaturesSection, HowItWorksSection, VaultSection, ScoreSection, AnalyseSection, RecentPlayersStrip). **Décision** : supprimer le code mort, SAUF `LiveSection` (Ça bouge maintenant — enchère chaude + hottest deal + top mover) qui est bonne pour la mission → la réintégrer dans la home entre ScrollStory et le marquee, avec les garde-fous fraîcheur de 2.5. Supprimer aussi le CSS orphelin correspondant dans `home-cinematic.css` (prudence : vérifier au grep chaque classe avant suppression).

- [ ] **5.5 — Audit /search et /a-propos.** `/search` : vérifier si la recherche nav pointe dessus ou si c'est un doublon du flux /deals — si doublon, rediriger. `/a-propos` : la garder (crédibilité) mais vérifier qu'elle est à jour avec la mission, liée depuis le footer, et alignée sur le design system.

- [ ] **5.6 — Audit des crons et routes API mortes.** ~18 routes cron/API. Vérifier via `cron_runs` (table de monitoring existante) et `vercel.json` lesquelles tournent vraiment. Identifier les routes sans consommateur (grep). Rapport dans la note de tâche + suppression de ce qui est confirmé mort. Ne PAS toucher aux crons actifs (opportunites, enrich-scores, snapshot-scores, card-prices, hottest, trending, auctions, price-alerts, watchlist-alerts, weekly-picks, daily-digest, welcome-emails).

---

## PHASE 6 — NEXT LEVEL (une fois les fondations solides)

- [ ] **6.1 — PWA basique.** `manifest.json` (icônes, theme #05060a, standalone) + service worker minimal (cache statique, offline fallback page). La majorité des users est mobile ; c'est l'étape prévue post-auth dans la roadmap. Pas de push notifications dans cette tâche.

- [ ] **6.2 — Perf pass.** Lighthouse sur home, deals, player, dashboard. Cibles : LCP < 2.5s mobile. Points connus à vérifier : vidéo hero (poster + `preload="none"` + fallback statique mobile — les fichiers `/video/hero-bg.*` 404 actuellement, corriger ou retirer proprement), images NHL (lazy + sizes), payloads API (le summary dashboard doit rester < 50KB). Corriger le plus impactant, documenter le reste.

- [ ] **6.3 — Smoke tests.** Créer `scripts/smoke.mjs` : fetch de ~12 routes clés (pages SSR + APIs publiques) contre localhost:3001, vérifie status 200 + un marqueur de contenu par page (ex. "Card Metrics Score" sur /player/8481540). Exécutable via `npm run smoke`. C'est le filet de sécurité de la loop pour les itérations suivantes — l'ajouter au protocole de vérification (section 1) une fois créé.

- [ ] **6.4 — Onboarding "aha" plus rapide.** Le WelcomeTour existe. L'améliorer : après le choix langue/marché, proposer directement "choisis 3 joueurs à suivre" (liste des trending) → la watchlist n'est plus vide → le dashboard a du contenu dès la première session. Mesurer via `/api/track` (event `onboarding_players_followed`).

- [ ] **6.5 — Empty states intelligents partout.** Audit de tous les états vides (watchlist, portfolio, alertes, picks, notifications, deals sans résultat) : chaque état vide doit (a) expliquer la valeur de la feature en 1 phrase, (b) offrir UNE action concrète, (c) être beau (icône, ton du design system). Un user qui tombe sur du vide doit repartir avec un prochain pas.

- [ ] **6.6 — Partage social des scores.** Bouton "Partager" sur /player : copie un lien + l'OG image du joueur (route existante) rend le score visible dans le partage. Vérifier le rendu OG sur les dimensions Twitter/Discord. C'est le levier d'acquisition le moins cher — chaque score partagé est une pub.

---

## ANNEXE — Carte du code (référence rapide pour la loop)

**Pages** : `/` (home cinématique), `/dashboard` (+DashboardClient), `/deals` (Deal Finder + compare), `/opportunites` (top-10), `/player/[id]`, `/analyse` (URL eBay → verdict), `/encheres`, `/pulse`, `/portfolio` (vault), `/watchlist`, `/picks`, `/notifications`, `/alertes`, `/digest`, `/parametres`, `/search`, `/compare`, `/grading` (à supprimer), `/backtest`, `/a-propos`, `/auth/login`, `/admin` (mission control, séparé).

**Lib clés** : `dealFinder.js` (orchestrateur eBay→score), `ebayServer.js` (OAuth + fetch eBay, ×1.37 hardcodé), `soldPrices.js` (130point sold comps), `dealInvestmentScore.js` (DeepSeek scoring annonces), `cardScoutScore.js`/`cardScoutScoreMath.js` (score joueur 13 facteurs), `opportunitesTop.js` (top-10 batch), `playerScores.js`, `scoreEnrichment.js` (4 sous-scores avancés), `portfolioValue.js`, `auctionDeals.js`, `persistentCache.js` (cache_generic Supabase), `cronLog.js` (cron_runs), `ebayAffiliate.js`, `sportConfig.js` (sport-agnostic).

**Supabase** : `cache_generic` (cache persistant), `player_scores`, `player_scores_history` (snapshots), `watchlist`, `portfolio_cards`, `price_alerts`, `notifications`, `cron_runs`.

**Env dev** : port 3001 (Docker occupe 3000), `npm run dev -- --port 3001` via launch config `card-scout`. Lint : `npm run lint`. Pas de tests (jusqu'à 6.3).

---

*Fin du plan. Prochaine itération : première case `[ ]` en partant du haut.*
