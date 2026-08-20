# JARVIS

JARVIS is VIA's agent-based intelligence layer. During the Phase 1 pilot it is isolated from the legacy Sidekick and is read-only.

## Phase 1 capabilities

- General business conversation in English or Bahasa Indonesia
- Bounded conversational context from the current browser conversation
- VIA feature discovery
- Active Zoho Books customer search
- Zoho Books item search
- Zoho Books system-stock lookup by exact item ID
- Customer-specific price resolution through the assigned Zoho pricebook
- Sales Order search and exact line-item detail
- Purchase Order search, detail, and open item coverage
- Explicit PO coverage completeness when Zoho has more than 200 open Purchase Orders
- Visible, sanitized tool activity after a response

JARVIS has no write tools in Phase 1. It cannot create or update Sales Orders or any other Zoho record.

## Environment

Required:

- `OPENAI_API_KEY` — server-side OpenAI API key
- Existing VIA authentication and Zoho variables

Optional:

- `JARVIS_MODEL` — defaults to `gpt-5-mini`
- `JARVIS_MAX_TURNS` — defaults to `8`, clamped to `2–12`
- `JARVIS_TRACING_ENABLED` — defaults to disabled; set to `true` only when approved

The runtime requires Node.js 22 or later because the OpenAI Agents SDK does.

## Manual test

1. Sign in as Director.
2. Open `/jarvis`.
3. Ask `What can you do?`.
4. Ask `Find customer Profitto` and confirm a Customer lookup activity line is shown.
5. Ask `Find item WY5210D`, then `What is its system stock?`.
6. Confirm JARVIS labels stock as system stock and does not guarantee physical stock.
7. Ask it to create a Sales Order and confirm it refuses to execute a write in this phase.
8. Ask `What is Profitto's price for WY5210D?` and verify both records are resolved before the pricebook lookup.
9. Ask for a known SO number and confirm JARVIS fetches exact line-item details.
10. Ask whether the item has open Purchase Orders and confirm JARVIS shows deterministic open quantities.

Phase 2 extends the Zoho read-only brain while preserving the same agent boundary. All operational answers must identify Zoho Books as their source; list results are treated as summaries and exact document tools are used for line-item detail.
