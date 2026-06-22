create table if not exists public.bank_reconciliation_ledger (
  id uuid primary key default gen_random_uuid(),
  bank_row_hash text not null unique,
  date date,
  amount numeric(18,2) not null default 0,
  direction text not null default 'CR',
  description text,
  name_in_statement text,
  status text not null default 'received',
  source text not null default 'via',
  zoho_payment_id text,
  zoho_payment_number text,
  invoice_ids jsonb not null default '[]'::jsonb,
  invoice_numbers jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_reconciliation_ledger_status_idx
  on public.bank_reconciliation_ledger (status);

create index if not exists bank_reconciliation_ledger_date_amount_idx
  on public.bank_reconciliation_ledger (date, amount);
