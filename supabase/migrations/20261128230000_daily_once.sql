-- The 9am / 6pm jobs send at most once per couple per day, even if the job is called again
-- (deploy tests used to call it and re-send real reminders).
create table if not exists public.daily_sent (
  couple_id uuid not null,
  slot text not null,
  day date not null,
  at timestamptz not null default now(),
  primary key (couple_id, slot, day)
);
alter table public.daily_sent enable row level security;
revoke all on public.daily_sent from anon, authenticated;
