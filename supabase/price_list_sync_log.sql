create table if not exists public.price_list_sync_log (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  item_name text,
  prefix text,
  tier text not null,
  action text not null,
  reason text,
  discount_applied text,
  rate_applied numeric,
  dry_run boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists price_list_sync_log_created_at_idx
  on public.price_list_sync_log (created_at);
