create table if not exists public.shipment_invoice_log (
  id uuid primary key default gen_random_uuid(),
  salesorder_id text not null,
  salesorder_number text,
  customer_name text,
  invoice_number text,
  success boolean not null default true,
  error text,
  converted_at timestamptz not null default now()
);

create index if not exists shipment_invoice_log_converted_at_idx
  on public.shipment_invoice_log (converted_at);
