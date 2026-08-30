-- Phase 3 (Stock Inquiry Operations): extends the Phase 2 stock_inquiries
-- table (which only had a single locked-in 'RECEIVED' status) with the full
-- durable workflow. Additive ALTER — safe to re-run.

alter table public.stock_inquiries drop constraint if exists stock_inquiries_status_check;

alter table public.stock_inquiries
  alter column status drop default,
  alter column status set default 'RECEIVED';

alter table public.stock_inquiries
  add constraint stock_inquiries_status_check check (status in (
    'RECEIVED', 'NEEDS_QUANTITY', 'READY_FOR_VENDOR_CHECK', 'WAITING_FOR_VENDOR',
    'VENDOR_CLOSED', 'VENDOR_AVAILABLE', 'VENDOR_OUT_OF_STOCK', 'CHECKING_VARINDO_STOCK',
    'VARINDO_AVAILABLE', 'VARINDO_OUT_OF_STOCK', 'NEEDS_HUMAN', 'RESPONSE_READY',
    'CLOSED', 'CANCELLED', 'FAILED'
  ));

alter table public.stock_inquiries add column if not exists stock_inquiry_type text check (stock_inquiry_type in ('EXISTENCE', 'QUANTITY_SPECIFIC', 'COUNT_INQUIRY'));
alter table public.stock_inquiries add column if not exists primary_source text;
alter table public.stock_inquiries add column if not exists active_stock_check_request_id uuid;
alter table public.stock_inquiries add column if not exists final_availability text check (final_availability in ('AVAILABLE', 'SUFFICIENT', 'INSUFFICIENT', 'OUT_OF_STOCK', 'UNKNOWN'));
alter table public.stock_inquiries add column if not exists final_source text check (final_source in ('VENDOR', 'VARINDO_INTERNAL'));
alter table public.stock_inquiries add column if not exists prepared_response_text text;
alter table public.stock_inquiries add column if not exists human_required boolean not null default false;
alter table public.stock_inquiries add column if not exists sla_deadline_at timestamptz;
alter table public.stock_inquiries add column if not exists next_eligible_check_at timestamptz;
alter table public.stock_inquiries add column if not exists closed_at timestamptz;
-- conversation_id (Phase 2) is often the normalized phone key, not a valid
-- WhatsApp send target — store the raw number separately for outbound sends.
alter table public.stock_inquiries add column if not exists customer_phone_raw text;

create index if not exists stock_inquiries_status_idx on public.stock_inquiries (status);
create index if not exists stock_inquiries_next_eligible_idx on public.stock_inquiries (next_eligible_check_at) where next_eligible_check_at is not null;
create index if not exists stock_inquiries_sla_idx on public.stock_inquiries (sla_deadline_at) where sla_deadline_at is not null;
