-- Access tests: pairing, who can read/write what, storage folders, push rows, recovery, triggers.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
insert into auth.users values (:'A'), (:'B'), (:'C'), (:'D');
insert into private.config values ('functions_url', 'https://test.local/functions/v1'), ('notify_secret', 's3cret');

create function public.expect_error(q text, msg text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if position(msg in sqlerrm) = 0 then raise exception 'expected error "%" from [%], got "%"', msg, q, sqlerrm; end if;
    return;
  end;
  raise exception 'expected error "%" from [%], but it succeeded', msg, q;
end $$;
grant execute on function public.expect_error(text, text) to anon, authenticated;

-- ---- A starts a couple
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
select (public.create_couple())->>'code' as code \gset
select public.my_info()->>'rc' as rc_a \gset
select public.my_info()->>'couple_id' as cid \gset
do $$ declare i jsonb := public.my_info(); begin
  assert i->>'role' = 'me', 'A is me';
  assert (i->>'partner_joined')::boolean = false, 'nobody joined yet';
  assert length(i->>'code') = 6 and length(i->>'rc') = 8, 'code lengths';
  assert (public.create_couple())->>'code' = i->>'code', 'create_couple is idempotent';
end $$;
insert into public.docs (couple_id, coll, id, data) values (public.my_couple(), 'couple', 'main', '{"me":{"name":"재민"},"partner":{"name":"은지"},"start":"2025-03-14"}');
select public.expect_error(format('insert into public.docs (couple_id, coll, id, data, by_user) values (%L, %L, %L, %L, %L)', public.my_couple(), 'answers', 'x', '{}', :'B'), 'row-level security');
reset role;

-- ---- B joins with the code (lower case and spaces are fine)
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
select public.expect_error($q$select public.join_couple('ZZZZZZ')$q$, 'code_not_found');
select public.join_couple('  ' || lower(:'code') || ' ');
select public.my_info()->>'rc' as rc_b \gset
do $$ declare k1 text := public.widget_token(); k2 text := public.widget_token(); k3 text := public.widget_token(true); begin
  assert length(k1) = 24, 'widget key';
  assert k1 = k2, 'widget key is stable';
  assert k3 <> k1 and public.widget_token() = k3, 'reset makes a new key';
end $$;
select public.expect_error('select me_rc from public.couples', 'permission denied');
select public.expect_error('select me_wt from public.couples', 'permission denied');
do $$ declare i jsonb := public.my_info(); begin
  assert i->>'role' = 'partner', 'B is partner';
  assert (select count(*) from public.couples where code is not null) = 1, 'B can read the safe couple columns';
  assert (i->>'partner_joined')::boolean, 'joined';
  assert (select count(*) from public.docs) = 1, 'B sees the couple doc';
  assert (select count(*) from public.couples) = 1, 'B sees the couple row';
end $$;
-- B can write as B, but cannot leave A as the author of B's change
update public.docs set data = data || '{"x":1}', by_user = auth.uid() where coll = 'couple';
select public.expect_error($q$update public.docs set data = data || '{"y":1}', by_user = '00000000-0000-0000-0000-00000000000a' where coll = 'couple'$q$, 'row-level security');
insert into public.docs (couple_id, coll, id, data) values (public.my_couple(), 'answers', '2026-11-24_partner', '{"date":"2026-11-24","text":"좋아"}');
-- photo folder of the couple
insert into storage.objects (bucket_id, name) values ('photos', :'cid' || '/p1.jpg');
select public.save_push('{"endpoint":"https://push.example/b1","keys":{"p256dh":"x","auth":"y"}}');
select public.save_push('{"endpoint":"https://push.example/b1","keys":{"p256dh":"x","auth":"y"}}');
do $$ begin assert (select count(*) from public.push_subs) = 1, 'one push row after saving twice'; end $$;
reset role;

-- ---- C, a stranger
select set_config('request.jwt.claim.sub', :'C', false);
set role authenticated;
select public.expect_error(format('select public.join_couple(%L)', :'code'), 'couple_full');
do $$ begin
  assert public.my_info() is null, 'C has no couple';
  assert (select count(*) from public.docs) = 0, 'C sees no docs';
  assert (select count(*) from public.couples) = 0, 'C sees no couples';
  assert (select count(*) from public.push_subs) = 0, 'C sees no push rows';
  assert (select count(*) from storage.objects) = 0, 'C sees no photos';
end $$;
select public.expect_error(format('insert into public.docs (couple_id, coll, id, data) values (%L, %L, %L, %L)', :'cid', 'answers', 'evil', '{}'), 'row-level security');
select public.expect_error(format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'photos', :'cid' || '/evil.jpg'), 'row-level security');
select public.expect_error($q$select public.save_push('{"endpoint":"https://push.example/c"}')$q$, 'no_couple');
select public.expect_error('select public.widget_token()', 'no_couple');
select public.expect_error('select * from private.config', 'permission denied');
select public.expect_error('select * from public.snap_sent', 'permission denied');
select public.expect_error($q$update public.couples set partner = auth.uid()$q$, 'permission denied');
reset role;

-- ---- signed-out visitors can do nothing
set role anon;
select public.expect_error('select public.create_couple()', 'permission denied');
select public.expect_error('select public.my_info()', 'permission denied');
select public.expect_error('select count(*) from public.docs', 'permission denied');
select public.expect_error('select count(*) from public.couples', 'permission denied');
reset role;

-- ---- A sees B's writes, not B's push row
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
do $$ begin
  assert (select count(*) from public.docs where coll = 'answers') = 1, 'A sees B''s answer';
  assert (select count(*) from storage.objects) = 1, 'A sees the photo';
  assert (select count(*) from public.push_subs) = 0, 'push rows are private';
end $$;
-- the couple row itself cannot be edited directly, only through the functions
select public.expect_error($q$update public.couples set code = 'AAAAAA'$q$, 'permission denied');
reset role;

-- ---- triggers call the notify function only for watched collections
do $$ begin
  assert (select count(*) from net.calls where url like '%/notify') = 1, 'one notify call so far (the answer)';
  assert (select headers->>'x-notify-secret' from net.calls limit 1) = 's3cret', 'secret header';
  assert (select body->'record'->>'coll' from net.calls limit 1) = 'answers', 'record in body';
  assert (select count(*) from cron.job where jobname like 'uridul-%') = 3, 'morning, evening and snap jobs';
end $$;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
insert into public.docs (couple_id, coll, id, data) values (public.my_couple(), 'moods', '2026-11-24_me', '{"m":"happy"}');
insert into public.docs (couple_id, coll, id, data) values (public.my_couple(), 'letters', 'l1', '{"text":"hi"}');
insert into public.docs (couple_id, coll, id, data) values (public.my_couple(), 'settings', 's1', '{}');
insert into public.docs (couple_id, coll, id, data) values (public.my_couple(), 'snaps', '2026-11-24_me', '{"date":"2026-11-24"}');
reset role;
do $$ begin
  assert (select count(*) from net.calls) = 4, 'moods, letters and snaps notify, settings does not';
  assert (select body->>'type' from net.calls order by id desc limit 1) = 'INSERT', 'type is INSERT';
end $$;
select private.call_daily('evening');
do $$ begin assert (select url from net.calls order by id desc limit 1) = 'https://test.local/functions/v1/daily?slot=evening', 'daily url'; end $$;

-- ---- D: a new phone that first started a couple by mistake, then recovers A's place
select set_config('request.jwt.claim.sub', :'D', false);
set role authenticated;
select (public.create_couple())->>'code' as stray \gset
select public.expect_error(format('select public.recover_couple(%L, %L)', :'code', 'WRONGRC1'), 'bad_recovery');
select public.recover_couple(:'code', :'rc_a');
do $$ declare i jsonb := public.my_info(); begin
  assert i->>'role' = 'me', 'D took A''s place';
  assert (select count(*) from public.docs) = 6, 'D sees the couple''s docs';
end $$;
select public.my_info()->>'rc' as rc_d \gset
reset role;
do $$ begin assert (select count(*) from public.couples) = 1, 'the stray empty couple was removed'; end $$;
select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;
do $$ begin
  assert public.my_info() is null, 'A no longer has access';
  assert (select count(*) from public.docs) = 0, 'A sees nothing now';
end $$;
-- the old recovery code was used up
select public.expect_error(format('select public.recover_couple(%L, %L)', :'code', :'rc_a'), 'bad_recovery');
reset role;
select set_config('request.jwt.claim.sub', :'B', false);
set role authenticated;
do $$ begin assert (public.my_info()->>'role') = 'partner', 'B is unaffected'; end $$;
delete from public.docs where coll = 'settings';
do $$ begin assert (select count(*) from public.docs where coll = 'settings') = 0, 'B can delete'; end $$;
select public.drop_push('https://push.example/b1');
do $$ begin assert (select count(*) from public.push_subs) = 0, 'push row removed'; end $$;
reset role;
\echo 'access tests: all assertions passed'
