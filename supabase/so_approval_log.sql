create table if not exists public.so_approval_log (
  id uuid primary key default gen_random_uuid(),
  salesorder_id text not null,
  salesorder_number text not null,
  customer_name text not null,
  total numeric not null default 0,
  item_count integer not null default 0,
  approved_by text not null,        -- 'admin' | 'director' (role — no per-user identity exists)
  approved_at timestamptz not null default now()
);

create index if not exists so_approval_log_approved_idx
  on public.so_approval_log (approved_at);
