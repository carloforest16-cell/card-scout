---
name: verify-cardmetrics
description: Vérification complète d'un changement de code sur Card Metrics avant de le déclarer terminé — build/lint, preview, fraîcheur des caches, mobile, pages authentifiées. À utiliser après toute tâche de code sur ce repo, pas seulement en fin de plan.
---

# Verify Card Metrics

Procédure de vérification standard pour ce repo. Ne pas déclarer une tâche terminée sans être passé par les étapes pertinentes ci-dessous.

## 1. Lint + build (toujours)

```bash
npm run lint
npm run build 2>&1 | tee build.log
grep -c "Attempted import error" build.log; rm build.log
```

- Zéro nouvelle erreur/warning de lint (les 5 warnings pré-existants documentés dans `CLAUDE.md`/l'historique de session ne comptent pas comme nouveaux).
- Build réussi, zéro occurrence de `Attempted import error` — c'est exactement le signal qui a masqué le bug de prod de juin.
- **Piège** : `npm run build` et le serveur preview `npm run dev` partagent `.next`. Si un preview tourne, le build va corrompre son cache. Toujours redémarrer le preview après un build (`preview_stop` puis `preview_start`).

## 2. Preview (si le changement est observable dans le navigateur)

- Port 3001 par défaut (`npm run dev -- --port 3001`) — 3000 est souvent occupé.
- `preview_console_logs` (niveau `error`) pour les erreurs JS.
- `preview_snapshot` pour vérifier le contenu/la structure plutôt qu'un screenshot pour du texte.
- `preview_resize` preset `mobile` (375px) pour tout changement de layout — pas de scroll horizontal.
- Si la tâche touche une route API : l'appeler en direct et vérifier le payload (`preview_network` ou fetch direct).

## 3. Fraîcheur des caches

Les caches longue durée masquent les changements de code fraîchement déployés :

| Cache | TTL |
|---|---|
| Hottest deals | 6h |
| Enchères | 30min |
| Sold prices (130point) | 24h |
| Opportunités top | 14 jours |
| Trending / Underdog | 24h |

Tester via `?refresh=1` sur la route publique quand elle le supporte. Un `forceRefresh` peut prendre plusieurs minutes — lancer le fetch en fire-and-forget dans `preview_eval` (timeout 30s) plutôt que d'attendre en bloquant, puis revérifier après.

## 4. Vérifier une page authentifiée

L'auth normale est Google OAuth (impossible à automatiser). Pour vérifier `/dashboard`, `/portfolio`, `/watchlist`, etc. :

1. Confirmer que `.env.local` a `NEXT_PUBLIC_ALLOW_TEST_LOGIN=1` (jamais commité, jamais en prod).
2. `npm run seed:test-user` si l'utilisateur de test n'existe pas encore (crée `test-agent@cardmetrics.io` + données réalistes). **Vérifier d'abord si `.env.local` pointe vers la prod ou un projet séparé** — si c'est la prod, confirmer avec l'utilisateur avant d'écrire des données de test.
3. Sur `/auth/login`, remplir le formulaire "Connexion de test (dev uniquement)" via `preview_fill` + `preview_click`.
4. Vérifier la redirection (`window.location.pathname` via `preview_eval`) puis `preview_snapshot`/`preview_screenshot`.

## 5. Smoke test

```bash
npm run smoke   # contre un serveur local déjà lancé, SMOKE_BASE_URL=http://localhost:3001 par défaut
```

12 routes publiques clés. Un échec ici avec un serveur qui tourne signale une vraie régression, pas un problème réseau.

## Limites à documenter honnêtement

Si une vérification est impossible dans la session (réseau sortant restreint, secret indisponible, port occupé par une autre session) : le dire explicitement plutôt que de simuler un résultat. Ne jamais écrire "vérifié" pour quelque chose qui n'a pas réellement tourné.
