---
name: nouvelle-page
description: Checklist et primitives à réutiliser avant de créer ou refondre une page/composant sur Card Metrics. À utiliser pour tout nouveau écran, widget, ou refonte visuelle dans ce repo.
---

# Nouvelle page — Card Metrics

## D'abord, le skill design

```bash
python .claude/skills/ui-ux-pro-max/scripts/search.py "<type de page> <mots-clés>" --design-system -p "Card Metrics"
```

Toujours en premier pour une nouvelle page — palette, typographie, layout recommandés pour le type de produit.

## Primitives et tokens existants (voir `CLAUDE.md` § Existing Design Tokens)

- Couleurs : `--void`, `--platinum`/`--silver`/`--ghost`, `--ice` (accent), `--gold`, `--profit`/`--loss`, `--border-cn`, `--surface`, `--abyss`.
- Fonts : `--cn-hero`, `--cn-display`, `--cn-body`, `--cn-mono`.
- Composants : `cn-btn`, `cn-badge`, `cn-eyebrow`, `cn-card`, `cn-h1`/`cn-h2`, `Reveal`, `TiltCard`, `Skeleton`, `SpotlightCard`.
- Patterns d'animation génériques (préférer à ceux scopés `home-wow.css`) : `app/components/wow/wow.css` — `.wow-rise`, `.wow-btn-shine`, `.wow-card-hover`.
- `CountUp` existe déjà en `app/components/CountUp.js` — ne pas en recréer un autre ailleurs, c'est le genre de duplication qu'on essaie d'éliminer.

## Règles dures (non négociables)

- UI 100% français (fr-CA), prix en CAD par défaut.
- Aucune fake data présentée comme réelle — état vide honnête ou widget masqué si la vraie donnée n'existe pas encore.
- Pas d'emojis comme icônes — SVG ou `lucide-react` uniquement.
- Touch targets ≥44×44px, espacement ≥8px, jamais d'interaction hover-only.
- Contraste texte primaire ≥4.5:1 (clair et sombre).
- Layout testé à 375px — pas de scroll horizontal.
- Animations respectent `prefers-reduced-motion`.
- Erreurs de formulaire affichées près du champ concerné, pas seulement en haut de page.

## Pièges connus à checker avant de livrer

- `overflow-x: hidden` sur un ancêtre casse `position: sticky` — utiliser `overflow-x: clip` à la place si un élément sticky ne fonctionne pas.
- Un conteneur avec des enfants positionnés `absolute` peut être piégé par une règle CSS parente qui force `position: relative` sur tous les enfants directs (vu sur `.hc-hero`) — vérifier les règles CSS de l'ancêtre avant de déboguer le positionnement.
- `AnimatePresence mode="wait"` (framer-motion) peut bloquer un contenu qui doit être visible à coup sûr — préférer une animation CSS pure (`@keyframes` + changement de `key` React) pour du texte critique.
- En preview automatisée, `document.hidden === true` gèle les animations JS/CSS — vérifier le DOM/contenu, pas l'opacité mid-animation.

## Avant de conclure

Passer par le skill `verify-cardmetrics` (lint, build, preview desktop + mobile, console sans erreur).
