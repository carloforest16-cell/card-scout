-- Filtres des alertes prix (lib/alertFilters.js). Retour de Carlo 2026-09-30 :
-- une alerte « Wyatt Johnston sous 28 $ » envoyait n'importe quelle carte du
-- joueur. Toutes les colonnes sont optionnelles ; les alertes existantes
-- gardent leur comportement (aucun type = tous, état « any », pas de score
-- minimum, pas de mot-clé). RLS déjà active sur price_alerts (policies
-- auth.uid() = user_id, vérifiées le 2026-09-30) — rien à changer.

alter table public.price_alerts
  add column if not exists card_types text[],
  add column if not exists condition text not null default 'any',
  add column if not exists min_score numeric,
  add column if not exists keyword text;

alter table public.price_alerts
  drop constraint if exists price_alerts_condition_check,
  add constraint price_alerts_condition_check
    check (condition in ('any', 'raw', 'graded'));

alter table public.price_alerts
  drop constraint if exists price_alerts_min_score_check,
  add constraint price_alerts_min_score_check
    check (min_score is null or (min_score > 0 and min_score <= 10));

alter table public.price_alerts
  drop constraint if exists price_alerts_keyword_check,
  add constraint price_alerts_keyword_check
    check (keyword is null or char_length(keyword) <= 60);
