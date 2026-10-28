-- Tape Deck Phase 1: Live Host Queues
-- Idempotent migration — safe to re-run. Apply after schema.sql and schema-idempotent.sql.
-- Adds: host profiles fields, tape plays/type, rooms, queue_entries, queue_board view,
-- RLS for the new tables, an admin-approval policy, and a plays increment helper.

-- ---------- profiles: host + admin fields ----------
alter table public.profiles add column if not exists is_host boolean not null default false;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists host_status text not null default 'none' check (host_status in ('none','applied','approved','denied'));
alter table public.profiles add column if not exists host_bio text;
alter table public.profiles add column if not exists genres text;
alter table public.profiles add column if not exists tiktok_url text;
alter table public.profiles add column if not exists line_min_cents integer not null default 300 check (line_min_cents >= 300);
alter table public.profiles add column if not exists tip_paypal text;
alter table public.profiles add column if not exists tip_venmo text;
alter table public.profiles add column if not exists tip_cashapp text;
alter table public.profiles add column if not exists tip_chime text;

-- Admins (owner) can update any profile — used for host approvals.
drop policy if exists "admins update any profile" on public.profiles;
create policy "admins update any profile" on public.profiles for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- ---------- tapes: plays + type tag ----------
alter table public.tapes add column if not exists plays_count integer not null default 0;
alter table public.tapes add column if not exists type text check (type in ('ai','organic','hybrid'));

-- Hosts increment plays_count when they mark a tape played; the tapes RLS only lets
-- artists edit their own tapes, so the increment goes through this definer function.
create or replace function public.increment_tape_plays(p_tape_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.tapes set plays_count = plays_count + 1 where id = p_tape_id;
$$;
grant execute on function public.increment_tape_plays(uuid) to authenticated;

-- ---------- rooms: one row per live session ----------
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  tiktok_url text,
  is_live boolean not null default false,
  hide_queue boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

drop policy if exists "rooms public read" on public.rooms;
create policy "rooms public read" on public.rooms for select using (true);

drop policy if exists "hosts manage own rooms" on public.rooms;
create policy "hosts manage own rooms" on public.rooms for all
  using (auth.uid() = host_id) with check (auth.uid() = host_id);

-- ---------- queue_entries: a tape's place in one host's line ----------
create table if not exists public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  tape_id uuid not null references public.tapes(id) on delete cascade,
  artist_id uuid not null references public.profiles(id) on delete cascade,
  segment text not null default 'pool' check (segment in ('pool','paid')),
  amount_cents integer not null default 0,
  status text not null default 'queued' check (status in ('queued','playing','played','waiting_on_artist','removed','expired','refunded')),
  checked_in boolean not null default false,
  pinned boolean not null default false,
  position integer,
  entered_at timestamptz not null default now(),
  played_at timestamptz,
  duration_played_seconds integer,
  listener_count integer,
  payment_id uuid,
  readded_from uuid references public.queue_entries(id)
);

-- One active entry per tape per host line.
create unique index if not exists queue_entries_one_active_per_host_tape
  on public.queue_entries (host_id, tape_id)
  where status in ('queued','playing','waiting_on_artist');

alter table public.queue_entries enable row level security;

drop policy if exists "queue entries public read" on public.queue_entries;
create policy "queue entries public read" on public.queue_entries for select using (true);

drop policy if exists "artists and hosts create entries" on public.queue_entries;
create policy "artists and hosts create entries" on public.queue_entries for insert
  with check (auth.uid() = artist_id or auth.uid() = host_id);

drop policy if exists "entry artist host admin update" on public.queue_entries;
create policy "entry artist host admin update" on public.queue_entries for update
  using (auth.uid() = artist_id or auth.uid() = host_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (auth.uid() = artist_id or auth.uid() = host_id or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- ---------- queue_board: public board view WITHOUT amounts ----------
create or replace view public.queue_board as
  select id, host_id, tape_id, artist_id, segment, status, checked_in, pinned, position,
         entered_at, played_at, duration_played_seconds, listener_count, readded_from
  from public.queue_entries;

grant select on public.queue_board to anon, authenticated;

-- Make yourself admin (run once, manually, with your own email):
-- update public.profiles set is_admin = true where id in (select id from auth.users where email = 'YOUR-EMAIL');
