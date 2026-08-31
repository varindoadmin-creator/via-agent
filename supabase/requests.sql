-- VIA Product/Pricing/Company Architecture brief, sections 48-56: a tracked,
-- retroactive migration for the `requests` table — the shared sample/
-- catalogue/quote intake table that already exists in production (created
-- directly in the Supabase dashboard, outside of any tracked migration).
-- Additive only (`create table if not exists` / `add column if not exists`),
-- safe to re-run — this documents the live schema, it does not change it.

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),

  request_type text not null check (request_type in ('sample', 'catalogue', 'quote')),
  status text not null default 'new' check (status in ('new', 'pending', 'completed', 'cancelled')),

  customer_name text,
  phone text,
  address text,
  item_code text,
  notes text,

  quantity numeric,
  unit text,

  created_at timestamptz not null default now()
);

create index if not exists requests_type_created_idx on public.requests (request_type, created_at desc);
create index if not exists requests_phone_idx on public.requests (phone);

-- Brief section 54: email notification bookkeeping for the new
-- app/api/requests/notify-sweep cron job. A null value means "not yet
-- notified" — an email failure leaves this null for retry, never erasing the
-- Supabase record (brief section 92).
alter table public.requests add column if not exists notified_at timestamptz;

alter table public.requests enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
