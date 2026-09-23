-- Fuite de données (audit 2026-09-23) : ces 3 tables n'avaient AUCUNE RLS,
-- donc lisibles / modifiables avec la clé anon publique (livrée dans le JS du
-- site) — welcome_emails_sent exposait les courriels des utilisateurs.
-- Tout le code qui les utilise passe par le service role (qui ignore la RLS) :
-- app/api/track, app/api/admin/*, lib/cronLog.js, lib/healthReport.js,
-- app/api/cron/welcome-emails. Appliqué en prod le 2026-09-23.
alter table public.welcome_emails_sent enable row level security;
alter table public.pageviews enable row level security;
alter table public.cron_runs enable row level security;
