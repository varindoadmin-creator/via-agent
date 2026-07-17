create table if not exists public.customer_bank_names (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  customer_name text not null,
  bank_account_name text not null,
  bank_account_name_key text not null,
  times_seen integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (customer_id, bank_account_name_key)
);

create index if not exists customer_bank_names_customer_idx
  on public.customer_bank_names (customer_id);

create index if not exists customer_bank_names_key_idx
  on public.customer_bank_names (bank_account_name_key);
