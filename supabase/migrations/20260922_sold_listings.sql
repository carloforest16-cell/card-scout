-- Ventes réelles gratuites via l'API officielle eBay Browse (lib/soldListings.js).
-- Remplace 130point, bloqué par Cloudflare depuis la mi-août 2026.
-- Cycle d'une ligne : pending (enchère notée avant sa fin) → sold / unsold / gone
-- (réglée après la fin via getItem : prix final + estimatedSoldQuantity).

create table if not exists public.sold_listings (
  item_id          text primary key,
  player_id        bigint not null,
  player_name      text not null,          -- minuscules, comme card_price_history
  title            text not null,
  cohort_key       text not null,          -- = card_price_history.card_type (même carte)
  end_at           timestamptz not null,
  marketplace      text not null default 'EBAY_CA',
  status           text not null default 'pending'
                   check (status in ('pending', 'sold', 'unsold', 'gone')),
  bid_count        integer not null default 0,
  last_bid_cad     numeric,                -- dernière offre vue à la collecte
  final_price      numeric,                -- prix final dans la devise eBay
  final_currency   text,
  final_price_cad  numeric,                -- renseigné seulement si status = 'sold'
  first_seen_at    timestamptz not null default now(),
  settled_at       timestamptz
);

create index if not exists sold_listings_pending_idx
  on public.sold_listings (end_at) where status = 'pending';

create index if not exists sold_listings_sold_cohort_idx
  on public.sold_listings (player_name, cohort_key, end_at) where status = 'sold';

-- RLS activé sans policy : seul le service role (code serveur) lit et écrit.
alter table public.sold_listings enable row level security;
