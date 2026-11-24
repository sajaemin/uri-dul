-- 우리 둘: database schema, access rules, storage and push plumbing.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------- tables ----------
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  me uuid references auth.users(id) on delete set null,
  partner uuid references auth.users(id) on delete set null,
  me_rc text,
  partner_rc text,
  me_wt text unique,
  partner_wt text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.docs (
  couple_id uuid not null references public.couples(id) on delete cascade,
  coll text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  by_user uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (couple_id, coll, id)
);

create table if not exists public.push_subs (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);

create schema if not exists private;
create table if not exists private.config (k text primary key, v text not null);
revoke all on schema private from public, anon, authenticated;

-- ---------- helpers ----------
create or replace function public.my_couple() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.couples where me = auth.uid() or partner = auth.uid() limit 1
$$;

create or replace function public.gen_code(n int) returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, n)
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before update on public.docs
  for each row execute function public.touch_updated_at();

-- ---------- row level security ----------
alter table public.couples enable row level security;
alter table public.docs enable row level security;
alter table public.push_subs enable row level security;

drop policy if exists couples_read on public.couples;
create policy couples_read on public.couples for select to authenticated
  using (me = auth.uid() or partner = auth.uid());

drop policy if exists docs_select on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;
create policy docs_select on public.docs for select to authenticated
  using (couple_id = public.my_couple());
create policy docs_insert on public.docs for insert to authenticated
  with check (couple_id = public.my_couple() and by_user = auth.uid());
create policy docs_update on public.docs for update to authenticated
  using (couple_id = public.my_couple())
  with check (couple_id = public.my_couple() and by_user = auth.uid());
create policy docs_delete on public.docs for delete to authenticated
  using (couple_id = public.my_couple());

drop policy if exists push_own on public.push_subs;
create policy push_own on public.push_subs for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and couple_id = public.my_couple());

-- the app changes couples and push rows only through the functions below
revoke all on public.couples, public.docs, public.push_subs from anon;
revoke insert, update, delete, truncate on public.couples, public.push_subs from authenticated;
-- recovery codes and widget keys are read only through my_info / widget_token, never by the partner
revoke select on public.couples from authenticated;
grant select (id, code, me, partner, created_at) on public.couples to authenticated;
revoke truncate on public.docs from authenticated;

-- ---------- couple pairing (called from the app) ----------
create or replace function public.my_info() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.couples;
begin
  select * into c from public.couples where me = auth.uid() or partner = auth.uid() limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'couple_id', c.id,
    'code', c.code,
    'role', case when c.me = auth.uid() then 'me' else 'partner' end,
    'rc', case when c.me = auth.uid() then c.me_rc else c.partner_rc end,
    'me_joined', c.me is not null,
    'partner_joined', c.partner is not null);
end $$;

create or replace function public.create_couple() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if public.my_couple() is not null then return public.my_info(); end if;
  loop
    v_code := public.gen_code(6);
    exit when not exists (select 1 from public.couples where code = v_code);
  end loop;
  insert into public.couples (code, me, me_rc) values (v_code, auth.uid(), public.gen_code(8));
  return public.my_info();
end $$;

create or replace function public.join_couple(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c public.couples;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if public.my_couple() is not null then return public.my_info(); end if;
  select * into c from public.couples where code = upper(trim(p_code)) for update;
  if not found then raise exception 'code_not_found'; end if;
  if c.partner is not null then raise exception 'couple_full'; end if;
  update public.couples set partner = auth.uid(), partner_rc = public.gen_code(8) where id = c.id;
  return public.my_info();
end $$;

create or replace function public.recover_couple(p_code text, p_rc text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c public.couples;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into c from public.couples where code = upper(trim(p_code)) for update;
  if not found then raise exception 'code_not_found'; end if;
  -- leave any empty couple this device started by mistake
  delete from public.couples where me = auth.uid() and partner is null and id <> c.id;
  update public.couples set partner = null where partner = auth.uid() and id <> c.id;
  if c.me_rc = upper(trim(p_rc)) then
    update public.couples set me = auth.uid(), me_rc = public.gen_code(8), me_wt = null where id = c.id;
  elsif c.partner_rc = upper(trim(p_rc)) then
    update public.couples set partner = auth.uid(), partner_rc = public.gen_code(8), partner_wt = null where id = c.id;
  else
    raise exception 'bad_recovery';
  end if;
  return public.my_info();
end $$;

-- a private key for the home-screen widget (read-only summary); p_reset makes a new one
create or replace function public.widget_token(p_reset boolean default false) returns text
language plpgsql volatile security definer set search_path = public as $$
declare c public.couples; t text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into c from public.couples where me = auth.uid() or partner = auth.uid() limit 1 for update;
  if not found then raise exception 'no_couple'; end if;
  t := case when c.me = auth.uid() then c.me_wt else c.partner_wt end;
  if t is null or p_reset then
    t := public.gen_code(24);
    if c.me = auth.uid() then update public.couples set me_wt = t where id = c.id;
    else update public.couples set partner_wt = t where id = c.id; end if;
  end if;
  return t;
end $$;

create or replace function public.save_push(p_sub jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare cid uuid := public.my_couple();
begin
  if auth.uid() is null or cid is null then raise exception 'no_couple'; end if;
  delete from public.push_subs where endpoint = p_sub->>'endpoint';
  insert into public.push_subs (endpoint, user_id, couple_id, sub) values (p_sub->>'endpoint', auth.uid(), cid, p_sub);
end $$;

create or replace function public.drop_push(p_endpoint text) returns void
language sql volatile security definer set search_path = public as $$
  delete from public.push_subs where endpoint = p_endpoint and user_id = auth.uid()
$$;

revoke all on function public.my_info(), public.create_couple(), public.join_couple(text), public.recover_couple(text, text), public.save_push(jsonb), public.drop_push(text), public.widget_token(boolean) from public, anon;
grant execute on function public.my_info(), public.create_couple(), public.join_couple(text), public.recover_couple(text, text), public.save_push(jsonb), public.drop_push(text), public.widget_token(boolean) to authenticated;

-- ---------- realtime ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'couples') then
    alter publication supabase_realtime add table public.couples;
  end if;
end $$;

-- ---------- photo storage (private, per couple folder) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('photos', 'photos', false, 26214400)
on conflict (id) do nothing;

drop policy if exists uridul_photos_read on storage.objects;
drop policy if exists uridul_photos_insert on storage.objects;
drop policy if exists uridul_photos_delete on storage.objects;
create policy uridul_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple()::text);
create policy uridul_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple()::text);
create policy uridul_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_couple()::text);

-- ---------- push on changes ----------
create or replace function private.on_doc_change() returns trigger
language plpgsql security definer set search_path = public, private, extensions as $$
declare u text; s text;
begin
  select v into u from private.config where k = 'functions_url';
  select v into s from private.config where k = 'notify_secret';
  if u is null then return new; end if;
  perform net.http_post(
    url := u || '/notify',
    body := jsonb_build_object('type', tg_op, 'record', to_jsonb(new), 'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end),
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
    timeout_milliseconds := 5000);
  return new;
end $$;

drop trigger if exists docs_notify on public.docs;
create trigger docs_notify after insert or update on public.docs
  for each row when (new.coll in ('answers', 'photos', 'pokes', 'events', 'memories', 'bucket', 'pings', 'moods', 'letters'))
  execute function private.on_doc_change();

-- ---------- daily reminders (09:00 and 18:00 Korea time) ----------
create or replace function private.call_daily(slot text) returns void
language plpgsql security definer set search_path = public, private, extensions as $$
declare u text; s text;
begin
  select v into u from private.config where k = 'functions_url';
  select v into s from private.config where k = 'notify_secret';
  if u is null then return; end if;
  perform net.http_post(
    url := u || '/daily?slot=' || slot,
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', s),
    timeout_milliseconds := 15000);
end $$;

select cron.schedule('uridul-morning', '0 0 * * *', $cron$select private.call_daily('morning')$cron$);
select cron.schedule('uridul-evening', '0 9 * * *', $cron$select private.call_daily('evening')$cron$);
