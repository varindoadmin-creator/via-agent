-- VIA Customer Operations Phase 8: extends the Phase 2 conversation-state
-- table into the full customer-service case record, per the brief's own
-- instruction not to build a separate ticketing platform when the existing
-- table can carry the required states. Additive ALTER, safe to re-run.

alter table public.wati_conversation_state drop constraint if exists wati_conversation_state_state_check;

alter table public.wati_conversation_state
  alter column state drop default,
  alter column state set default 'AUTO';

alter table public.wati_conversation_state
  add constraint wati_conversation_state_state_check check (state in (
    'AUTO', 'NEEDS_HUMAN', 'HUMAN_ASSIGNED', 'HUMAN_ACTIVE', 'RESOLVED', 'CLOSED'
  ));

alter table public.wati_conversation_state
  add column if not exists priority text not null default 'NORMAL'
    check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),

  -- No per-user directory exists in VIA (lib/auth.ts has exactly two shared
  -- role accounts) -- "assigned to a user" is modeled as "assigned to
  -- whoever is logged in as this role" (brief section 8's assignment engine,
  -- scoped to VIA's actual architecture).
  add column if not exists assigned_role text check (assigned_role in ('admin', 'director')),
  add column if not exists assigned_team text check (assigned_team in (
    'CUSTOMER_SERVICE', 'SALES', 'FINANCE', 'OPERATIONS', 'MANAGEMENT'
  )),

  add column if not exists handoff_reason text check (handoff_reason in (
    'CUSTOMER_REQUESTED_HUMAN', 'AMBIGUOUS_CUSTOMER', 'AMBIGUOUS_PRODUCT', 'PRICE_NOT_FOUND',
    'PRICE_CONFLICT', 'DISCOUNT_REQUEST', 'SPECIAL_PRICING', 'LARGE_PROJECT_QUOTE',
    'STOCK_RESPONSE_AMBIGUOUS', 'VENDOR_TIMEOUT', 'ORDER_MODIFICATION', 'ORDER_CANCELLATION',
    'PAYMENT_REVIEW', 'PAYMENT_PROOF_RECEIVED', 'DELIVERY_STATUS_UNAVAILABLE', 'NEW_ADDRESS_REVIEW',
    'CUSTOMER_DUPLICATE_REVIEW', 'ZOHO_WRITE_FAILURE', 'IDENTITY_VERIFICATION_REQUIRED',
    'SECURITY_SENSITIVE_REQUEST', 'COMPLAINT', 'AI_UNAVAILABLE', 'OTHER_EXCEPTION'
  )),

  -- handoff_created_at is the SLA clock start -- set once per handoff episode
  -- and never reset by a duplicate trigger while already NEEDS_HUMAN+ (brief
  -- section 37 idempotency).
  add column if not exists handoff_created_at timestamptz,
  add column if not exists human_assigned_at timestamptz,
  add column if not exists human_first_response_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_at timestamptz,

  -- Optimistic concurrency for the auto/human race check (brief sections 76-77).
  add column if not exists version integer not null default 1;

create index if not exists wati_conversation_state_service_idx
  on public.wati_conversation_state (state, assigned_team, handoff_created_at);

-- VIA Customer Operations Phase 8, brief section 60: the audit trail for
-- every handoff/assignment/takeover/transfer/SLA/resolution action. Section
-- 61's observability events are emitted as console.info at each write site,
-- not stored separately.
create table if not exists public.customer_service_audit_log (
  id uuid primary key default gen_random_uuid(),

  normalized_phone text not null,
  event_type text not null,
  actor text not null check (actor in ('SYSTEM', 'JARVIS', 'INTERNAL_USER')),
  actor_role text check (actor_role in ('admin', 'director')),

  from_value text,
  to_value text,
  metadata jsonb,

  created_at timestamptz not null default now()
);

create index if not exists customer_service_audit_log_phone_idx
  on public.customer_service_audit_log (normalized_phone, created_at desc);

alter table public.customer_service_audit_log enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
