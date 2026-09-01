-- VIA Customer Operations Phase 11: Proactive Customer & Sales Automation.
-- One row per detected follow-up/reorder/outreach opportunity, deduplicated
-- in place by dedupe_key — same convention as operational_findings (Phase
-- 10). Detection, recommendation, and eligibility are all deterministic;
-- only the wording of an outbound message may involve Jarvis, and only
-- after this row's facts are already fixed (see docs/proactive-customer-
-- sales-automation.md).

create table if not exists public.proactive_customer_actions (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',

  type text not null check (type in (
    'QUOTATION_FOLLOW_UP', 'ORDER_INTENT_FOLLOW_UP', 'REORDER_OPPORTUNITY', 'SAMPLE_REQUEST_FOLLOW_UP',
    'CUSTOMER_CALLBACK', 'NEEDS_INFORMATION_FOLLOW_UP', 'INACTIVE_COMMERCIAL_DRAFT', 'SERVICE_RECOVERY',
    'APPROVED_CAMPAIGN_OUTREACH', 'DORMANT_CUSTOMER_REENGAGEMENT'
  )),

  customer_id text,
  customer_phone_normalized text,
  conversation_id text,
  quotation_id text,
  sales_order_id text,
  commercial_draft_id uuid,
  sample_request_id uuid,
  product_id text,

  reason text not null,
  evidence jsonb not null default '[]'::jsonb,

  recommended_action text not null,
  channel text not null check (channel in ('WHATSAPP', 'INTERNAL_TASK')),
  message_category text check (message_category in (
    'SERVICE_MESSAGE', 'TRANSACTIONAL_MESSAGE', 'SALES_FOLLOW_UP', 'MARKETING_MESSAGE'
  )),

  status text not null default 'DETECTED' check (status in (
    'DETECTED', 'REVIEW_REQUIRED', 'APPROVED', 'SCHEDULED', 'SENT', 'CUSTOMER_RESPONDED',
    'CONVERTED', 'DISMISSED', 'EXPIRED', 'FAILED', 'CANCELLED'
  )),

  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  due_at timestamptz,

  requires_approval boolean not null default true,
  approved_by text check (approved_by in ('admin', 'director')),
  approved_at timestamptz,

  assigned_role text check (assigned_role in ('admin', 'director')),
  assigned_team text check (assigned_team in (
    'CUSTOMER_SERVICE', 'SALES', 'FINANCE', 'OPERATIONS', 'MANAGEMENT'
  )),

  -- Bounded follow-up cadence (brief section 19) — never a third stage.
  follow_up_stage text check (follow_up_stage in ('INITIAL_FOLLOW_UP', 'FINAL_FOLLOW_UP')),

  draft_message text,
  sent_message text,
  sent_at timestamptz,
  responded_at timestamptz,
  converted_at timestamptz,

  -- Never a projected/invented figure (brief section 23) — always traced to
  -- an actual quotation/order/draft total, labelled accordingly, never "revenue".
  potential_value numeric,
  potential_value_label text,

  dismissal_reason text,

  dedupe_key text not null,

  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists proactive_customer_actions_dedupe_key_idx
  on public.proactive_customer_actions (dedupe_key);
create index if not exists proactive_customer_actions_status_idx
  on public.proactive_customer_actions (status, due_at);
create index if not exists proactive_customer_actions_customer_idx
  on public.proactive_customer_actions (customer_id);
create index if not exists proactive_customer_actions_phone_idx
  on public.proactive_customer_actions (customer_phone_normalized);
create index if not exists proactive_customer_actions_type_idx
  on public.proactive_customer_actions (type, status);

alter table public.proactive_customer_actions enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.

-- Full audit trail, mirroring operational_finding_events' exact shape.
create table if not exists public.proactive_action_events (
  id uuid primary key default gen_random_uuid(),

  action_id uuid not null references public.proactive_customer_actions(id) on delete cascade,
  event_type text not null,
  actor text not null check (actor in ('SYSTEM', 'JARVIS', 'INTERNAL_USER')),
  actor_role text check (actor_role in ('admin', 'director')),

  from_value text,
  to_value text,
  metadata jsonb,

  created_at timestamptz not null default now()
);

create index if not exists proactive_action_events_action_idx
  on public.proactive_action_events (action_id, created_at desc);

alter table public.proactive_action_events enable row level security;
