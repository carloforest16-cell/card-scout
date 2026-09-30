-- ebay_clicks : les policies INSERT acceptaient n'importe quelle ligne
-- (with_check = true) — on pouvait attribuer un clic au compte d'un autre
-- utilisateur via la clé anon publique. Désormais : un visiteur anonyme
-- n'insère que des clics anonymes, un utilisateur connecté que les siens.
-- (RLS déjà active sur la table — vérifié le 2026-09-30.)
drop policy if exists "anon_insert" on public.ebay_clicks;
create policy "anon_insert" on public.ebay_clicks
  for insert to anon
  with check (user_id is null);

drop policy if exists "authenticated_insert" on public.ebay_clicks;
create policy "authenticated_insert" on public.ebay_clicks
  for insert to authenticated
  with check (user_id is null or auth.uid() = user_id);
