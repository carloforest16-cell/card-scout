-- Alertes prix + watchlist toutes les 15 min (pg_cron + pg_net, gratuit).
-- Vercel Hobby ne permet qu'un cron par jour ; GitHub Actions retardait ses
-- tâches planifiées de 4-5 h. Appliqué en prod le 2026-09-24.
--
-- Le jeton n'est JAMAIS écrit ici : il vit chiffré dans le Vault Supabase
-- (secret « alerts_trigger_token ») et son empreinte SHA-256 dans
-- cache_generic (clé « alerts-trigger-token-v1 », lue par lib/alertsTrigger.js).
-- Rotation : nouveau jeton → vault.update_secret(...) + nouvelle empreinte
-- (+ secret GitHub ALERTS_TRIGGER_TOKEN pour le déclenchement manuel).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- select vault.create_secret('<JETON>', 'alerts_trigger_token', 'Jeton des alertes Card Metrics');

select cron.unschedule(jobid) from cron.job where jobname = 'cardmetrics-alerts';

select cron.schedule('cardmetrics-alerts', '*/15 * * * *', $job$
  select net.http_get(
    url := 'https://www.cardmetrics.io/api/cron/' || route,
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_trigger_token')),
    timeout_milliseconds := 60000
  )
  from unnest(array['price-alerts', 'watchlist-alerts']) as route;
$job$);
