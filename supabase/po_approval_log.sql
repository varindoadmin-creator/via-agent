create table if not exists public.po_approval_log (
  id uuid primary key default gen_random_uuid(),
  purchaseorder_id text not null,
  purchaseorder_number text not null,
  vendor_name text not null,
  total numeric not null default 0,
  stock_items jsonb not null default '[]'::jsonb,  -- for_stock/excess_stock line items only: [{item_name, sku, quantity, stock_qty, match_status, location_name}]
  approved_by text not null,
  approved_at timestamptz not null default now()
);

create index if not exists po_approval_log_approved_idx
  on public.po_approval_log (approved_at);
