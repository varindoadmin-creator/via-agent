create table if not exists public.jarvis_pending_actions (
  id uuid primary key,
  conversation_id text not null,
  requested_by text not null check (requested_by in ('admin', 'director')),
  action_type text not null check (action_type in ('create_sales_order')),
  status text not null default 'pending' check (status in ('pending', 'executing', 'completed', 'failed', 'expired')),
  payload jsonb not null,
  preview jsonb not null,
  zoho_object_id text,
  zoho_object_number text,
  error text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  completed_at timestamptz
);

create index if not exists jarvis_pending_actions_status_idx
  on public.jarvis_pending_actions (status, expires_at);

alter table public.jarvis_pending_actions enable row level security;
