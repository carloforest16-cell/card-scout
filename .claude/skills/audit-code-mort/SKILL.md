---
name: audit-code-mort
description: Méthode fiable pour déterminer si un fichier/composant/fonction est réellement mort avant de le supprimer. À utiliser avant toute suppression de code sur ce repo, ou quand on soupçonne du code orphelin.
---

# Audit code mort — méthode

Ne jamais déclarer un fichier mort sur la base d'un grep restreint. Un précédent (`/player/[id]`) a fait croire à tort que 2 fichiers étaient morts parce que le grep utilisait `--include="*.js"` et ratait le vrai composant rendu, en `.jsx`.

## Étapes

1. **Grep sans filtre d'extension** (ou explicitement `.js` ET `.jsx`) :
   ```bash
   grep -rn "NomDuComposant\|nomDeLaFonction" --include="*.{js,jsx}" .
   ```
   Ne jamais restreindre à une seule extension par défaut dans ce repo — le mélange `.js`/`.jsx` est réel (voir `components/ui/*.jsx`).

2. **Remonter la chaîne d'importeurs réels**, pas juste le premier niveau. Un fichier peut être importé par un fichier lui-même mort — suivre la chaîne jusqu'à une route (`app/**/page.js`) ou un composant effectivement monté dans le JSX rendu.

3. **Vérifier le JSX effectivement rendu**, pas seulement les imports statiques. Un import peut exister sans que le composant soit jamais monté (branche conditionnelle morte, feature flag toujours faux, etc.) — lire le corps du composant parent pour confirmer.

4. **Chercher les usages dynamiques** : `require()` conditionnel, chargement par nom de fichier construit dynamiquement, exports ré-exportés depuis un barrel file (`index.js`) — ces patterns cassent un grep naïf sur le nom exact.

5. **Une fois confirmé mort** : supprimer complètement, ne pas commenter/renommer en `_unused` ou laisser un `// removed`. Si la suppression touche plusieurs fichiers, une zone/dossier par itération plutôt qu'un big-bang.

## Outillage disponible

- `knip` (ajouté en devDependency, tâche 5.3 de `PLAN-FONDATIONS.md`) — cartographie automatique des exports/imports/dépendances inutilisés. Traiter son rapport comme point de départ à vérifier manuellement (étapes 2-4 ci-dessus), pas comme vérité absolue — `knip` peut avoir des faux positifs sur des patterns dynamiques.

## Après suppression

Vérifier `npm run lint` (zéro nouvelle erreur d'import cassé) et `npm run build` (zéro `Attempted import error`) — voir skill `verify-cardmetrics`.
