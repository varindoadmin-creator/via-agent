create table if not exists public.salesperson_auto_assign_log (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,        -- 'sales_order' | 'invoice'
  document_id text not null,
  document_number text not null,
  customer_id text not null,
  customer_name text not null,
  salesperson_id text not null,
  salesperson_name text not null,
  success boolean not null,
  error text,
  assigned_at timestamptz not null default now()
);

create index if not exists salesperson_auto_assign_log_assigned_idx
  on public.salesperson_auto_assign_log (assigned_at);
