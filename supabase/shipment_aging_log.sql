create table if not exists public.shipment_aging_log (
  id uuid primary key default gen_random_uuid(),
  package_id text not null,
  package_number text,
  salesorder_id text not null,
  salesorder_number text,
  customer_name text,
  days_aging integer not null default 1,
  check_date date not null,     -- Jakarta calendar date this check ran on
  flagged_at timestamptz not null default now(),
  unique (package_id, check_date)
);

create index if not exists shipment_aging_log_check_date_idx
  on public.shipment_aging_log (check_date);
