create table if not exists public.so_purchase_gap_log (
  id uuid primary key default gen_random_uuid(),
  salesorder_id text not null,
  salesorder_number text not null,
  customer_name text,
  total numeric not null default 0,
  sub_status_formatted text,
  check_date date not null,         -- Jakarta calendar date this SO was confirmed on and flagged for
  confirmed_at text,                -- raw Zoho field used (submitted_date / last_modified_time / date)
  notified boolean not null default false,
  flagged_at timestamptz not null default now(),
  unique (salesorder_id, check_date)
);

create index if not exists so_purchase_gap_log_check_date_idx
  on public.so_purchase_gap_log (check_date);
