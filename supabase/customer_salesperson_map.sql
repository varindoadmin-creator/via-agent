create table if not exists public.customer_salesperson_map (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  customer_name text not null,
  salesperson_id text not null,
  salesperson_name text not null,
  times_seen integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (customer_id, salesperson_id)
);

create index if not exists customer_salesperson_map_customer_idx
  on public.customer_salesperson_map (customer_id);
