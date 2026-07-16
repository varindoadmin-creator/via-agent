create table if not exists public.tax_invoice_sent_log (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null unique,
  invoice_number text,
  customer_name text,
  sent_at timestamptz not null default now()
);

create index if not exists tax_invoice_sent_log_sent_at_idx
  on public.tax_invoice_sent_log (sent_at);
