-- JARVIS Knowledge / RAG v1. Apply in Supabase before uploading company SOPs or policies.
create table if not exists public.jarvis_knowledge_documents (
  id uuid primary key, organization_id text not null, title text not null, source_type text not null,
  authority text not null, domain text not null, department text, version text not null, status text not null,
  owner text, source_url text, file_reference text, supersedes_document_id uuid, effective_from date,
  effective_until date, visibility_roles text[] not null default array['director'], checksum text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists jarvis_knowledge_document_checksum_idx on public.jarvis_knowledge_documents(organization_id, checksum) where checksum is not null;
create index if not exists jarvis_knowledge_document_scope_idx on public.jarvis_knowledge_documents(organization_id, status, domain, effective_from);
create table if not exists public.jarvis_knowledge_chunks (
  id uuid primary key, document_id uuid not null references public.jarvis_knowledge_documents(id) on delete cascade,
  organization_id text not null, heading text, section_path text, page integer, text text not null,
  keywords text[] not null default '{}', claim_kind text not null, chunk_index integer not null,
  created_at timestamptz not null default now()
);
create index if not exists jarvis_knowledge_chunk_scope_idx on public.jarvis_knowledge_chunks(organization_id, document_id, chunk_index);
create index if not exists jarvis_knowledge_chunk_keywords_idx on public.jarvis_knowledge_chunks using gin(keywords);
alter table public.jarvis_knowledge_documents enable row level security;
alter table public.jarvis_knowledge_chunks enable row level security;
-- The server service-role key performs all access checks before retrieval. No browser policies are granted.
