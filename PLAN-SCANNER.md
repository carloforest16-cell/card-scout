# PLAN-SCANNER — Outil « card show » (idée, pas encore commencé)

Idée de Carlo (2026-09-30) : un outil pour dénicher des deals en personne dans les card shows. Mis de côté volontairement (« trop gros pour ce soir »). **Rien n'est codé.** Ce fichier garde le brainstorm pour la prochaine session.

## L'idée
- **Scan carte par carte** → score du joueur, bon investissement ou non, prix des comps.
- **Photo de toute la table** → repérer les meilleurs joueurs / deals (avec les étiquettes de prix).

## Recommandations issues du brainstorm
1. **Commencer par le scan d'UNE carte, pas la table.** Détecter 40 cartes sur une photo (reflets, sleeves, toploaders, petit texte) est un problème de vision difficile → version 3.
2. **Scanner le DOS de la carte.** Nom, année, set et numéro y sont imprimés en texte net → une simple lecture OCR (gratuite, possible sur le téléphone) suffit souvent, sans entraîner de modèle.
3. **Réutiliser l'existant :** `cardNumberExtractor` (empreinte de carte), Card Metrics Score, annonces eBay, `sold_listings` (ventes réelles), moteur de `/analyse` (qui juge déjà une annonce eBay : même moteur, une photo en entrée au lieu d'une URL).
4. **Fonction qui change la donne : l'étiquette de prix.** L'utilisateur saisit (ou l'OCR lit) le prix du vendeur → « cote ~45 $, il demande 30 $ → 33 % sous le marché, joueur 7,8/10 → Acheter ».

## Contraintes à respecter
- **Réseau faible dans les salles** : réponse rapide, OCR sur l'appareil + un seul petit appel serveur.
- **IA = DeepSeek seulement** (guardrail CLAUDE.md) : l'API `deepseek-chat` ne lit pas les images. L'OCR sur l'appareil contourne le problème gratuitement ; reconnaître le DEVANT d'une carte par l'image demanderait une décision à part (autre modèle, budget — Carlo : budget 0 $).
- **Honnêteté des cotes** : aujourd'hui surtout des prix demandés (130point bloqué, `sold_listings` jeune) → toujours afficher la provenance, jamais présenter une cote faible comme sûre.
- **Quota eBay 5000 appels/jour partagé** : cache par empreinte de carte (50 personnes au même show scannent les mêmes cartes) + limite par utilisateur (`rateLimitOr429`).

## Parcours proposé
- [ ] **Étape 0 — Test avant de coder** : ~20 photos de dos de cartes prises par Carlo (marques variées, sleeves/toploaders avec reflets, quelques étiquettes de prix) → mesurer le taux d'identification OCR (joueur, set, numéro). Décider avec des chiffres.
- [ ] **MVP** : page « Scan » mobile (PWA, caméra) — photo du dos → 1 à 3 cartes candidates, confirmation d'un tap → fiche : score joueur, cote avec provenance, champ « prix demandé », verdict.
- [ ] **Ensuite** : lecture auto de l'étiquette de prix, historique « Mon show », liens vers alertes et portfolio (« acheté → ajouter au Vault »).
- [ ] **Plus tard** : photo de table, reconnaissance du devant de la carte.

Piste business : fonctionnalité qui justifierait un abonnement payant.
