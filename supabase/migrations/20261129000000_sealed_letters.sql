-- A time-capsule letter stays hidden from the person it is for until its open day (Korea time):
-- the database does not hand it over at all before then, only its writer can see it.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select case when me = auth.uid() then 'me' when partner = auth.uid() then 'partner' end
  from public.couples where me = auth.uid() or partner = auth.uid() limit 1
$$;
grant execute on function public.my_role() to authenticated;

create or replace function public.doc_visible(coll text, data jsonb) returns boolean
language sql stable set search_path = public as $$
  select coll <> 'letters'
      or coalesce(data->>'openAt', '') <= to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')
      or data->>'from' is null
      or data->>'from' = public.my_role()
$$;
grant execute on function public.doc_visible(text, jsonb) to authenticated;

drop policy if exists docs_select on public.docs;
create policy docs_select on public.docs for select to authenticated
  using (couple_id = public.my_couple() and public.doc_visible(coll, data));
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated
  using (couple_id = public.my_couple() and public.doc_visible(coll, data))
  with check (couple_id = public.my_couple() and by_user = auth.uid());
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete to authenticated
  using (couple_id = public.my_couple() and public.doc_visible(coll, data));
