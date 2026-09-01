-- VIA Phase 13, brief section 48: durable persistence for the model-routing
-- cost/token/latency data lib/jarvis/runner.ts already computes on every run
-- but, before this phase, only ever logged to Cloud Run's own stdout via
-- console.info('[jarvis.run]', ...) — never durably stored, so no dashboard
-- could summarize it over time. This table is additive and read by
-- lib/jarvis/models/usageLog.ts / costDashboard.ts only; it changes no
-- existing behavior until JARVIS_MODEL_USAGE_LOG_ENABLED is set (same
-- staged-rollout convention as jarvis_reliability.sql).

create table if not exists public.jarvis_model_usage_log (
  id uuid primary key default gen_random_uuid(),

  organization_id text not null default 'varindo',

  run_id text not null,
  conversation_id text,

  model text not null,
  routing_tier text,
  routing_reason text,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  model_requests integer not null default 0,

  pricing_available boolean not null default false,
  estimated_cost_usd numeric,

  latency_ms integer,

  created_at timestamptz not null default now()
);

create index if not exists jarvis_model_usage_log_created_idx
  on public.jarvis_model_usage_log (created_at desc);
create index if not exists jarvis_model_usage_log_model_idx
  on public.jarvis_model_usage_log (model, created_at desc);
create index if not exists jarvis_model_usage_log_conversation_idx
  on public.jarvis_model_usage_log (conversation_id);

alter table public.jarvis_model_usage_log enable row level security;
-- VIA writes through the server-side service-role key only. No browser policy is added.
