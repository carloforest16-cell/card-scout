-- Limiteur de requêtes partagé (lib/rateLimit.js).
-- Protège les routes publiques qui coûtent de l'argent ou du quota (eBay Browse
-- 5000 appels/jour partagés par tout le site, DeepSeek facturé à l'usage,
-- courriels Resend) et la connexion admin (force brute).
-- Un compteur en mémoire ne suffit pas sur Vercel : chaque instance a le sien,
-- un attaquant qui tombe sur plusieurs instances multiplie sa limite.

create table if not exists public.rate_limits (
  key          text primary key,           -- ex. "deals:ip:1.2.3.4", "refresh:hottest:raw"
  window_start timestamptz not null default now(),
  count        integer not null default 0
);

-- RLS activé sans policy : seul le service role (code serveur) lit et écrit.
alter table public.rate_limits enable row level security;

-- Incrément ATOMIQUE (une seule requête INSERT … ON CONFLICT) : deux requêtes
-- simultanées ne peuvent pas lire le même compteur et passer toutes les deux.
create or replace function public.rate_limit_hit(
  p_key text,
  p_window_seconds integer,
  p_max integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
  v_start timestamptz;
  v_window interval := make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rl.window_start < now() - v_window then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - v_window then now() else rl.window_start end
  returning rl.count, rl.window_start into v_count, v_start;

  -- Ménage occasionnel (~1 appel sur 200) des fenêtres expirées depuis 1 jour.
  if random() < 0.005 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select v_count <= p_max, greatest(p_max - v_count, 0), v_start + v_window;
end;
$$;

-- La fonction n'est appelable que par le serveur (service role) : ni la clé
-- anon livrée dans le JS du site, ni un utilisateur connecté.
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
