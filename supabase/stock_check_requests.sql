-- Phase 3: the vendor-facing entity, decoupled from individual customer
-- StockInquiries so simultaneous inquiries for the same item+vendor share one
-- check (brief section 25 — deduplication/aggregation, kept quantity-safe via
-- stock_check_request_inquiries.sql).
create table if not exists public.stock_check_requests (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',
  item_id text not null,
  item_code text,
  source text not null, -- resolved brand/vendor, e.g. 'EDL', 'LAMITAK'

  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'WAITING', 'RESPONSE_RECEIVED', 'VENDOR_CLOSED', 'CLOSED')),

  created_at timestamptz not null default now(),
  sent_at timestamptz,
  response_at timestamptz,
  next_action_at timestamptz,

  response_raw text,
  parsed_availability text check (parsed_availability in ('AVAILABLE', 'OUT_OF_STOCK', 'AMBIGUOUS', 'FUTURE_AVAILABILITY', 'UNKNOWN')),
  -- Confidential. Never read by customer-facing code — see disclosurePolicy.ts.
  parsed_quantity_internal numeric,
  recorded_by text
);

create index if not exists stock_check_requests_open_idx
  on public.stock_check_requests (item_id, source, status)
  where status in ('PENDING', 'SENT', 'WAITING', 'VENDOR_CLOSED');

create index if not exists stock_check_requests_next_action_idx
  on public.stock_check_requests (next_action_at)
  where next_action_at is not null;

alter table public.stock_check_requests enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
