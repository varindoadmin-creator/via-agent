-- VIA Customer Operations Phase 6, brief sections 31-32: the
-- Quotation/Sales-Order-in-progress draft, and its line items. No Zoho
-- write happens until READY_FOR_REVIEW -> WAITING_FOR_APPROVAL -> an
-- internal approval (commercial_approvals) executes the write.
create table if not exists public.commercial_drafts (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',
  type text not null check (type in ('QUOTATION', 'SALES_ORDER')),
  source text not null default 'WATI' check (source in ('WATI', 'VIA')),

  conversation_id text,
  customer_id text,
  customer_draft_id uuid references public.customer_drafts(id),

  delivery_address_id text,
  proposed_delivery_address jsonb,

  -- Working state for the single line this pass supports (multi-line
  -- deferred — see docs/customer-operations-order-processing.md). Carried on
  -- the draft itself so a customer's identity/address-selection reply (which
  -- doesn't repeat the product) can resume exactly what was originally asked
  -- for, without re-parsing the selection message for a product mention.
  pending_product_id text,
  pending_item_code text,
  pending_product_name text,
  pending_quantity numeric,
  pending_unit text,
  pending_brand text,
  pending_source_message_id text,

  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'NEEDS_CUSTOMER', 'CUSTOMER_ONBOARDING', 'NEEDS_PRODUCT',
    'NEEDS_QUANTITY', 'NEEDS_PRICE', 'WAITING_STOCK', 'NEEDS_DELIVERY_INFO',
    'READY_FOR_REVIEW', 'WAITING_FOR_APPROVAL', 'APPROVED', 'EXECUTING',
    'COMPLETED', 'FAILED', 'STALE', 'CANCELLED'
  )),

  currency text not null default 'IDR',

  subtotal numeric,
  tax numeric,
  total numeric,

  salesperson_id text,
  payment_terms_id text,

  source_message_ids text[] not null default '{}',

  zoho_object_type text check (zoho_object_type in ('ESTIMATE', 'SALES_ORDER')),
  zoho_object_id text,
  zoho_object_number text,

  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commercial_drafts_conversation_idx
  on public.commercial_drafts (conversation_id, created_at desc);

create index if not exists commercial_drafts_status_idx
  on public.commercial_drafts (status, created_at desc);

create table if not exists public.commercial_draft_lines (
  id uuid primary key default gen_random_uuid(),
  commercial_draft_id uuid not null references public.commercial_drafts(id) on delete cascade,

  product_id text not null,
  item_code text,
  product_name text not null,

  quantity numeric not null,
  unit text,

  approved_unit_price numeric,
  tax_treatment text,

  stock_status text not null default 'PENDING'
    check (stock_status in ('PENDING', 'SUFFICIENT', 'INSUFFICIENT', 'OUT_OF_STOCK', 'UNKNOWN')),

  -- Links to the Phase 3 stock_inquiries row driving this line's async
  -- vendor-first check. The line's stock_status is derived from that row's
  -- final_availability (see deriveStockStatusFromInquiry) rather than
  -- duplicating the vendor-check state machine here.
  stock_inquiry_id uuid references public.stock_inquiries(id),

  source_message_id text,

  line_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commercial_draft_lines_draft_idx
  on public.commercial_draft_lines (commercial_draft_id, line_order);

alter table public.commercial_drafts enable row level security;
alter table public.commercial_draft_lines enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
