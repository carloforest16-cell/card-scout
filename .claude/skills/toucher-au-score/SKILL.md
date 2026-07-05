---
name: toucher-au-score
description: Garde-fous et architecture avant de modifier quoi que ce soit lié au Card Metrics Score (poids, facteurs, sous-scores avancés, calcul). À utiliser pour toute tâche touchant cardScoutScore.js, cardScoutScoreMath.js, ou les 4 sous-scores avancés.
---

# Toucher au Score — la zone la plus sensible du produit

Le Card Metrics Score EST le produit — sa crédibilité est ce qui différencie Card Metrics. Toute modification ici a un rayon d'impact large (page joueur, opportunités, dashboard, picks hebdo, digest).

## Architecture

- **`lib/cardScoutScoreMath.js`** — source unique de vérité pour les 13 facteurs et leurs poids (`SCORE_WEIGHTS`, `SCORE_WEIGHTS_BY_KEY`). Volontairement **sans** `"server-only"` pour rester importable depuis des composants client (ex. `PlayerAiScoreClient.js`) ET depuis le serveur — ne pas ajouter `"server-only"` à ce fichier, ça casserait les imports client existants.
- **`lib/cardScoutScore.js`** — orchestrateur serveur (`"server-only"`) : calcule les facteurs, appelle DeepSeek pour l'ajustement ±0.5, assemble le résultat final.
- **13 facteurs, poids fixes (somme = 1.00)** : Performance 14%, Momentum 10%, Accélération 8%, Âge 10%, Marché 10%, Liquidité 4%, Upside 14%, Hype 7%, Discrépance Marché 5%, Risque 5%, Catalyseurs 6%, Social/Buzz 3%, Équipe 4%.
- **4 sous-scores avancés** (`catalysts`, `risk`, `marketDiscrepancy`, `socialAttention`) ne se calculent **pas** en fastMode — ils tournent via le cron quotidien `enrich-scores` (`lib/scoreEnrichment.js`). Un score calculé en fastMode (ex. lors du recompute hebdomadaire batch) aura ces 4 facteurs à une valeur par défaut/neutre tant que `enrich-scores` n'est pas repassé dessus.
- DeepSeek ajuste le score final de ±0.5 max selon le contexte qualitatif — ce n'est PAS un recalcul des facteurs, juste un ajustement fin.
- Sport-agnostic via `lib/sportConfig.js` — ne pas hardcoder de logique NHL-only dans le calcul du score lui-même.

## Règle absolue

**Ne jamais modifier `SCORE_WEIGHTS` (les poids) sans tâche explicite du produit demandant ce changement.** Un changement de poids déplace silencieusement le classement de centaines de joueurs (opportunités, picks, dashboard) — ce n'est jamais un effet de bord acceptable d'une tâche par ailleurs (ex. un refactor, un fix de bug, une nouvelle feature UI).

## Avant de coder

1. Lire `cardScoutScoreMath.js` en entier — c'est court, la source de vérité doit être comprise, pas devinée.
2. Vérifier si le changement touche fastMode (chemin batch/rapide) ou le chemin enrichi (avec les 4 sous-scores) — les deux existent et divergent volontairement.
3. Si la tâche ajoute un nouveau facteur ou change un poids existant : c'est un changement de produit, pas un détail technique — confirmer explicitement avec l'utilisateur avant d'implémenter, même si la demande semble le sous-entendre.

## Vérification après changement

- `npm run lint` + `npm run build` (voir skill `verify-cardmetrics`).
- Recalculer manuellement le score d'au moins un joueur connu (ex. via `GET /api/score?playerId=`) et vérifier que le résultat est cohérent avec l'ancien comportement si le changement n'était pas censé affecter le score final.
- Vérifier que `SCORE_WEIGHTS_BY_KEY` (dérivé automatiquement) reste synchronisé — ne jamais dupliquer les poids ailleurs dans le code.
