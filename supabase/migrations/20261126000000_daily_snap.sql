-- 오늘의 한 장: a surprise moment each day (10:00-20:50 KST, 10-minute slots) when both take a photo.
-- The moment is worked out the same way in the app and in the daily function; this table only makes sure
-- the alert goes out once per couple per day.
create table if not exists public.snap_sent (
  couple_id uuid not null references public.couples (id) on delete cascade,
  date text not null,
  sent_at timestamptz not null default now(),
  primary key (couple_id, date)
);
alter table public.snap_sent enable row level security;
revoke all on public.snap_sent from anon, authenticated;

-- tell the partner when a snap goes up
drop trigger if exists docs_notify on public.docs;
create trigger docs_notify after insert or update on public.docs
  for each row when (new.coll in ('answers', 'photos', 'pokes', 'events', 'memories', 'bucket', 'pings', 'moods', 'letters', 'snaps'))
  execute function private.on_doc_change();

-- every 10 minutes the daily function checks whose moment it is
select cron.schedule('uridul-snap', '*/10 * * * *', $cron$select private.call_daily('snap')$cron$);
