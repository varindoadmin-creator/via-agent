create table if not exists public.customer_duplicate_ignores (
  id uuid primary key default gen_random_uuid(),
  group_fingerprint text not null unique,
  contact_ids text[] not null,
  customer_names text[] not null,
  match_reasons text[] not null default '{}',
  ignored_at timestamptz not null default now()
);

create index if not exists customer_duplicate_ignores_fingerprint_idx
  on public.customer_duplicate_ignores (group_fingerprint);

alter table public.customer_duplicate_ignores enable row level security;

-- VIA accesses this table only from authenticated server routes using the
-- service-role key. No browser/client policy is intentionally created.
