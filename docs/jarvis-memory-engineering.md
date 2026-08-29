# JARVIS Memory Engineering

## Boundary

JARVIS keeps four categories separate: **state** (active workflow truth), **memory** (useful historical context), **knowledge** (official policy/SOP), and **live data** (current Zoho/VIA facts). Source precedence is live VIA/Zoho data, workflow state, official knowledge, verified business-pattern memory, conversation memory, user preferences, then general model knowledge.

## v1 storage and lifecycle

Run [`supabase/jarvis_memories.sql`](../supabase/jarvis_memories.sql) once in Supabase. Memory is organization-scoped and may also be scoped by shared role-account user, conversation session, and canonical entity ID. It has provenance, origin, confidence, evidence count, verification time, expiry, and lifecycle status.

The memory service owns storage, retrieval, update, verification, expiration, and deletion. It deduplicates matching memories and supersedes contradictory user preferences. User-requested deletion physically removes the selected memory.

## Eligibility and safety

Deterministic policy rejects secrets, prompt-injection-like content, volatile live facts (stock, balance, price, document status), and business patterns without repeated evidence and provenance. v1 stores only explicit presentation preferences automatically. It never stores hidden reasoning or every chat message.

## Retrieval and context

The Context Builder retrieves at most five relevant memories. Ranking favors matching organization, role account, conversation, canonical entity, confidence, verification freshness, and recency. Memory is labeled as data—not instructions—and live tools, workflow state, and official policy override it.

Working memory is an in-process map and disappears after the request. Current tool output remains the authoritative observation for a run.

## Current limitations

- VIA currently uses shared Admin/Director accounts, so preference scope is `authenticated:<role>` until individual accounts exist.
- Conversation history remains browser-local. Automatic LLM-written conversation summaries are intentionally deferred to avoid fact contamination.
- No vector database: structured retrieval is suitable at the current scale.
- Pattern creation is available through the service but not automatically derived from historical sales yet; future tools must provide source references and repeated evidence.
