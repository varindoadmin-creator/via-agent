-- VIA Customer Operations Phase 10, brief sections 3, 41-44, 56, 91: durable,
-- deduplicated operational findings + their audit trail + a lightweight
-- action plan. One row per issue, updated in place on every detection pass
-- (never a new row per scheduled run) — the dedupe_key unique index is what
-- makes that possible.

create table if not exists public.operational_findings (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',
  category text not null check (category in (
    'CUSTOMER_SERVICE', 'STOCK', 'VENDOR', 'PRODUCT', 'PRICING', 'SALES', 'CONVERSION',
    'CUSTOMER_ONBOARDING', 'ORDER_PROCESSING', 'PAYMENT_SERVICE', 'SYSTEM_RELIABILITY',
    'DATA_QUALITY', 'COMMERCIAL_OPPORTUNITY'
  )),
  type text not null,

  severity text not null check (severity in ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  urgency text not null check (urgency in ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text not null default 'OPEN' check (status in (
    'OPEN', 'ACKNOWLEDGED', 'ACTION_PLANNED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED', 'EXPIRED'
  )),

  title text not null,

  metric_key text,
  entity_type text,
  entity_id text,

  detected_at timestamptz not null default now(),
  period_start timestamptz,
  period_end timestamptz,

  current_value numeric,
  baseline_value numeric,
  baseline_type text,
  absolute_change numeric,
  percent_change numeric,
  resolved_value numeric,

  evidence jsonb not null default '[]'::jsonb,

  confidence text not null check (confidence in ('LOW', 'MEDIUM', 'HIGH')),

  recommended_action_type text,
  recommendation_text text,

  assigned_role text check (assigned_role in ('admin', 'director')),
  assigned_team text check (assigned_team in (
    'CUSTOMER_SERVICE', 'SALES', 'FINANCE', 'OPERATIONS', 'MANAGEMENT'
  )),

  due_at timestamptz,

  dedupe_key text not null,
  rule_version integer not null default 1,

  -- Persistence/recovery bookkeeping (brief sections 35-36, 43-44) — tracked
  -- on the row itself rather than a separate detection-history table.
  consecutive_breach_count integer not null default 1,
  consecutive_normal_count integer not null default 0,
  recurrence_count integer not null default 0,

  -- Alert cooldown (brief section 62) — null until the first notification email fires.
  last_alerted_at timestamptz,

  dismissal_reason text check (dismissal_reason in (
    'KNOWN_ISSUE', 'NOT_MATERIAL', 'FALSE_POSITIVE', 'EXPECTED_BUSINESS_PATTERN', 'ALREADY_ADDRESSED', 'OTHER'
  )),

  version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists operational_findings_dedupe_key_idx on public.operational_findings (dedupe_key);
create index if not exists operational_findings_status_severity_idx on public.operational_findings (status, severity, detected_at desc);
create index if not exists operational_findings_category_idx on public.operational_findings (category, status);

alter table public.operational_findings enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.

-- Brief section 91: full audit trail, mirroring customer_service_audit_log's shape.
create table if not exists public.operational_finding_events (
  id uuid primary key default gen_random_uuid(),

  finding_id uuid not null references public.operational_findings(id) on delete cascade,
  event_type text not null,
  actor text not null check (actor in ('SYSTEM', 'JARVIS', 'INTERNAL_USER')),
  actor_role text check (actor_role in ('admin', 'director')),

  from_value text,
  to_value text,
  metadata jsonb,

  created_at timestamptz not null default now()
);

create index if not exists operational_finding_events_finding_idx
  on public.operational_finding_events (finding_id, created_at desc);

alter table public.operational_finding_events enable row level security;

-- Brief section 56: a lightweight action plan, deliberately not a project-management system.
create table if not exists public.operational_actions (
  id uuid primary key default gen_random_uuid(),

  finding_id uuid not null references public.operational_findings(id) on delete cascade,
  description text not null,

  owner_role text check (owner_role in ('admin', 'director')),
  owner_team text check (owner_team in (
    'CUSTOMER_SERVICE', 'SALES', 'FINANCE', 'OPERATIONS', 'MANAGEMENT'
  )),

  status text not null default 'TODO' check (status in ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED')),

  due_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operational_actions_finding_idx on public.operational_actions (finding_id, status);

alter table public.operational_actions enable row level security;
