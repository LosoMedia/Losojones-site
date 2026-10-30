-- Tape Deck Phase 2: PayPal Paid Segment (Skippers & Tippers)
-- Idempotent migration — safe to re-run. Apply after phase1-live-queues.sql.
-- Adds: profiles.paypal_email, the payments table (+ RLS), a payment_id FK on
-- queue_entries, paid_rank on the public queue_board view, and tightened
-- queue_entries reads (public board data flows through queue_board ONLY —
-- amounts live on the base table, which is now participant-only).

-- ---------- profiles: host PayPal payout email ----------
alter table public.profiles add column if not exists paypal_email text;

-- ---------- payments: every paid transaction, recorded for disputes ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  queue_entry_id uuid references public.queue_entries(id) on delete set null,
  provider text not null default 'paypal',
  provider_txn_id text,
  provider_capture_id text,
  amount_cents integer not null,
  platform_fee_cents integer not null default 0,
  host_amount_cents integer not null,
  status text not null default 'completed' check (status in ('completed','pending_verification','refunded','refund_requested')),
  created_at timestamptz not null default now()
);

create index if not exists payments_user_idx on public.payments (user_id);
create index if not exists payments_entry_idx on public.payments (queue_entry_id);

alter table public.payments enable row level security;

-- The paying artist reads their own payments. No public access, ever.
drop policy if exists "artists read own payments" on public.payments;
create policy "artists read own payments" on public.payments for select
  using (auth.uid() = user_id);

-- A host reads payments for entries standing in their own line (their receipts).
drop policy if exists "hosts read line payments" on public.payments;
create policy "hosts read line payments" on public.payments for select
  using (exists (select 1 from public.queue_entries e where e.id = queue_entry_id and e.host_id = auth.uid()));

-- Only the paying artist inserts a payment, and only as themselves.
drop policy if exists "artists insert own payments" on public.payments;
create policy "artists insert own payments" on public.payments for insert
  with check (auth.uid() = user_id);

-- The artist updates their own rows (linking an entry after creation, and the
-- refund flow marking rows refunded / refund_requested).
drop policy if exists "artists update own payments" on public.payments;
create policy "artists update own payments" on public.payments for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- queue_entries.payment_id now points at a real table (Phase 1 left it a bare uuid).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'queue_entries_payment_id_fkey') then
    alter table public.queue_entries
      add constraint queue_entries_payment_id_fkey
      foreign key (payment_id) references public.payments(id) on delete set null;
  end if;
end $$;

-- ---------- queue_entries: reads are participant-only from now on ----------
-- Phase 1 shipped a public SELECT policy because the board needed it; the board
-- now goes through queue_board (a view — views read with the owner's rights, so
-- the public board keeps working without exposing amount_cents).
drop policy if exists "queue entries public read" on public.queue_entries;

drop policy if exists "artists read own entries" on public.queue_entries;
create policy "artists read own entries" on public.queue_entries for select
  using (auth.uid() = artist_id);

drop policy if exists "hosts read line entries" on public.queue_entries;
create policy "hosts read line entries" on public.queue_entries for select
  using (auth.uid() = host_id);

drop policy if exists "admins read all entries" on public.queue_entries;
create policy "admins read all entries" on public.queue_entries for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- (Insert/update policies from Phase 1 are unchanged: artists and hosts create
-- entries; artist/host/admin update them.)

-- ---------- queue_board: same public columns + paid_rank, still NO amounts ----------
-- paid_rank is the exact paid-segment position: row_number over the host's
-- ACTIVE paid entries, amount desc, first payment (entered_at) asc. It is null
-- for pool entries and for entries that are no longer active.
create or replace view public.queue_board as
  select e.id, e.host_id, e.tape_id, e.artist_id, e.segment, e.status, e.checked_in, e.pinned, e.position,
         e.entered_at, e.played_at, e.duration_played_seconds, e.listener_count, e.readded_from,
         r.paid_rank
  from public.queue_entries e
  left join (
    select id,
           row_number() over (partition by host_id order by amount_cents desc, entered_at asc) as paid_rank
    from public.queue_entries
    where segment = 'paid' and status in ('queued','playing','waiting_on_artist')
  ) r on r.id = e.id;

grant select on public.queue_board to anon, authenticated;
