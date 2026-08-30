-- Phase 3: join table linking one StockCheckRequest to many StockInquiries.
-- Each row keeps the inquiry's own requestedQuantity/unit alongside the link
-- so fan-out from a single vendor response stays quantity-safe (brief section
-- 25): "5 available" can satisfy a linked 5-unit inquiry while leaving a
-- linked 50-unit inquiry NEEDS_HUMAN, never silently marked sufficient.
create table if not exists public.stock_check_request_inquiries (
  id uuid primary key default gen_random_uuid(),
  stock_check_request_id uuid not null references public.stock_check_requests(id),
  stock_inquiry_id uuid not null references public.stock_inquiries(id),
  requested_quantity numeric,
  requested_unit text,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_check_request_inquiries_unique_idx
  on public.stock_check_request_inquiries (stock_check_request_id, stock_inquiry_id);

create index if not exists stock_check_request_inquiries_request_idx
  on public.stock_check_request_inquiries (stock_check_request_id);

alter table public.stock_check_request_inquiries enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
