# JARVIS Knowledge / RAG Engineering

## Authority and source precedence

JARVIS uses current VIA/Zoho data first, then workflow state, official knowledge, verified memory, conversation context, and finally general model knowledge. Knowledge explains a policy or procedure; it cannot override current stock, price, balance, invoice status, or an enforced approval control.

## V1 store and metadata

Run `supabase/jarvis_knowledge.sql` to add organization-scoped documents and chunks. Documents include source type, authority, domain, version, lifecycle status, effective dates, owner, visibility roles, checksum, and supersession metadata. Chunks preserve heading/section, page when supplied, claim kind, exact identifiers, and parent document provenance.

The migration deliberately uses Postgres keyword indexing rather than an external vector database. V1 uses authority-aware lexical retrieval, exact product-code preservation, controlled business synonyms (SO, PO, AR), and metadata filters. Embeddings can be added later with an explicit model/version column and reindex job; they must not be mixed silently.

## Ingestion and lifecycle

`chunkKnowledge` validates normalized text, rejects secret/instruction-like content, and chunks at headings first. It keeps table lines together under their section. Duplicate files are detected with the parent document checksum. Authorized ingestion should create a document, create chunks, and mark it `ACTIVE` only after review. Archive/supersede must deactivate the old document so its chunks are not retrieved by default.

Only `ACTIVE` current documents are returned by default. Historical queries can request old/archived material explicitly. Authority ranking is OFFICIAL, APPROVED_INTERNAL, REFERENCE, DRAFT, ARCHIVED. Permission and organization filters run before text reaches JARVIS.

## Context and safety

The route retrieves no knowledge for operational lookup requests. For process/policy/definition questions it requests at most four passages, each capped before prompt injection. Context labels knowledge as untrusted data and requires title/version/section citations for material policy answers. Retrieval failures fall back only to the small source-linked built-in reference catalogue; JARVIS must say an approved company policy was not found rather than invent one.

Knowledge is explanatory only. Server-side tools and approval endpoints remain the enforcement layer. Logs record query count and retrieval latency without storing document content in operational traces.

## Diagnostics and evaluation

Search returns filters, selected results, rejected-filter reasons, scores, and latency for admin/developer diagnostics. Tests cover current official ranking, role filtering, exact product code preservation, and sensitive-content rejection. Add evaluation cases before wider ingestion: active SO policy, historical policy, missing policy, unauthorized document, a conflict between old/reference and active/official versions, and an exact SKU query.

## Current limitations

There is intentionally no public Knowledge UI or generic file upload endpoint yet. Existing chat uploads remain temporary request attachments and are not silently indexed. V1 also has no semantic embeddings or automated parser for office documents. The next safe step is a Director-only document review/upload UI with PDF/text parsing, metadata approval, and explicit reindex actions.
