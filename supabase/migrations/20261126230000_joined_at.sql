-- Growing the characters starts when the partner joins, so remember that moment.
alter table public.couples add column if not exists partner_joined_at timestamptz;
update public.couples set partner_joined_at = now() where partner is not null and partner_joined_at is null;

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
    'partner_joined', c.partner is not null,
    'joined_at', case when c.partner_joined_at is null then null else floor(extract(epoch from c.partner_joined_at) * 1000)::bigint end);
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
  update public.couples set partner = auth.uid(), partner_rc = public.gen_code(8), partner_joined_at = coalesce(partner_joined_at, now()) where id = c.id;
  return public.my_info();
end $$;
