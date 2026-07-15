create table if not exists public.invoice_auto_send_log (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null,
  invoice_number text,
  customer_name text,
  success boolean not null default true,
  skipped boolean not null default false,
  reason text,
  error text,
  sent_at timestamptz not null default now()
);

create index if not exists invoice_auto_send_log_sent_at_idx
  on public.invoice_auto_send_log (sent_at);
