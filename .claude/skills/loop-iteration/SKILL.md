---
name: loop-iteration
description: Protocole générique pour exécuter un PLAN-*.md par itérations (une tâche à la fois, vérifiée, commitée). À utiliser quand l'utilisateur demande d'exécuter/continuer un plan de type PLAN-FONDATIONS.md, PLAN-NEXT-LEVEL.md ou tout futur plan similaire dans ce repo.
---

# Loop Iteration — protocole générique pour PLAN-*.md

Ce repo utilise des documents `PLAN-*.md` en cases à cocher, exécutés par itérations successives (une tâche par tour, sauf instruction contraire explicite de l'utilisateur type "roule toutes les tâches").

## Format attendu d'un PLAN-*.md

- Phases numérotées (`## Phase 0`, `## Phase 1`, ...), chacune avec un compteur `(N/M)`.
- Tâches en cases à cocher `- [ ] **X.Y — Titre** — description.`
- Une section « Bugs découverts en cours de route » pour ce qui est trouvé mais hors scope.

## Protocole (une itération)

1. **Sélection** : trouver la première tâche `- [ ]` non cochée, dans l'ordre du document (Phase 0 → dernière phase).
2. **Lecture avant code** : lire les fichiers concernés. Le code a pu bouger depuis l'écriture de la tâche — si elle n'est plus pertinente, la cocher `[x]` avec une note "re-scopé : <raison>" plutôt que de coder à l'aveugle.
3. **Exécution complète** : pas de tâche à moitié faite. Si le scope réel dépasse ce que la description suggérait (ex. "vérifier X" révèle que le problème touche 10 fichiers, pas 1), traiter le scope réel — documenter l'écart dans la note de complétion plutôt que de s'arrêter à mi-chemin.
4. **Vérification obligatoire** : voir le skill `verify-cardmetrics` pour le détail (lint, build, preview, caches, pages authentifiées, smoke).
5. **Mise à jour du plan** : cocher `[x]`, ajouter `— Fait · <date>.` suivi d'une note qui explique CE QUI a été fait, POURQUOI si un choix d'implémentation a divergé de la description, et les LIMITES de vérification rencontrées (réseau restreint, secret indisponible, etc.) — honnêtement, jamais de faux "vérifié".
6. **Commit** : un commit par tâche, message `feat(scope):`, `fix(scope):`, `ci:`, `docs:` ou `chore:` selon la nature du changement, le fichier plan inclus dans le commit. Ne jamais push sans instruction explicite.
7. **Stop** — une seule tâche par itération, sauf si l'utilisateur a explicitement demandé d'enchaîner toutes les tâches sans pause (dans ce cas, répéter 1→6 jusqu'à la fin du plan ou jusqu'à blocage réel).

## Garde-fous transversaux

- Ne jamais présenter une vérification simulée comme réelle — dire explicitement "non vérifié : <raison>" plutôt que d'inventer un résultat.
- Une action qui touche un système partagé (vraie base de données, vrai email envoyé, push vers un remote) nécessite une confirmation explicite avant d'agir, même en plein milieu d'un "roule toutes les tâches" — l'autorisation de vitesse ne vaut pas autorisation de risque.
- Une tâche qui révèle un bug hors scope se documente dans « Bugs découverts en cours de route », pas corrigée sur-le-champ (sauf si triviale et sans risque).
