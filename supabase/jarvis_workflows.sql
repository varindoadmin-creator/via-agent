-- Apply in Supabase before enabling JARVIS_WORKFLOW_SCHEMA_ENABLED=true.
-- Workflow state is application state, never model memory.
create table if not exists jarvis_workflow_instances (
  id uuid primary key, workflow_type text not null, workflow_version integer not null,
  organization_id text not null, user_id text, trigger_type text not null, trigger_reference text,
  status text not null, current_step text, input jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb, required_fields jsonb not null default '[]'::jsonb,
  approval_id uuid, idempotency_key text not null unique, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), expires_at timestamptz not null
);
create table if not exists jarvis_workflow_step_history (
  id uuid primary key, workflow_instance_id uuid not null references jarvis_workflow_instances(id),
  step text not null, step_type text not null, attempt integer not null, status text not null,
  started_at timestamptz not null, completed_at timestamptz, result_reference text, error_code text
);
create table if not exists jarvis_business_events (
  id text primary key, type text not null, organization_id text not null, entity_type text not null,
  entity_id text not null, occurred_at timestamptz not null, source text not null, payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
create table if not exists jarvis_automation_definitions (
  id uuid primary key, name text not null, workflow_type text not null, organization_id text not null,
  created_by text not null, run_as_role text not null, required_permissions jsonb not null default '[]'::jsonb, enabled boolean not null default false, timezone text not null,
  schedule jsonb, autonomy_level integer not null check (autonomy_level between 0 and 4), allowed_actions jsonb not null,
  max_model_calls_per_run integer not null, max_entities_per_run integer not null, max_runtime_ms integer not null,
  concurrency_policy text not null, missed_run_policy text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists jarvis_automation_runs (
  id uuid primary key, automation_id uuid not null references jarvis_automation_definitions(id), workflow_instance_id uuid references jarvis_workflow_instances(id),
  trigger_type text not null, trigger_reference text, status text not null, entities_scanned integer not null default 0,
  findings_generated integer not null default 0, notifications_sent integer not null default 0, token_usage jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric, started_at timestamptz not null default now(), completed_at timestamptz, error_code text
);
create index if not exists jarvis_workflow_active_idx on jarvis_workflow_instances (organization_id, status, updated_at desc);
create index if not exists jarvis_automation_runs_idx on jarvis_automation_runs (automation_id, started_at desc);
