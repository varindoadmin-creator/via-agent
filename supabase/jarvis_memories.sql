-- JARVIS Memory Engineering v1. Run once in the Supabase SQL editor.
-- This table intentionally excludes current Zoho facts and workflow state.
create table if not exists public.jarvis_memories (
  id uuid primary key,
  organization_id text not null,
  user_id text,
  session_id text,
  entity_type text,
  entity_id text,
  memory_type text not null check (memory_type in ('conversation', 'user_preference', 'business_pattern')),
  origin text not null check (origin in ('EXPLICIT', 'INFERRED', 'DERIVED')),
  key text not null,
  value_json jsonb not null default '{}'::jsonb,
  summary text not null,
  source_type text not null,
  source_reference text,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence_count integer check (evidence_count is null or evidence_count >= 0),
  created_by text not null check (created_by in ('admin', 'director', 'system')),
  last_verified_at timestamptz,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'superseded', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jarvis_memories_lookup_idx
  on public.jarvis_memories (organization_id, status, user_id, session_id, entity_type, entity_id);
create index if not exists jarvis_memories_expiry_idx
  on public.jarvis_memories (organization_id, expires_at) where status = 'active';

alter table public.jarvis_memories enable row level security;
