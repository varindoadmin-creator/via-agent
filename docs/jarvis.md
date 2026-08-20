# JARVIS

JARVIS is VIA's agent-based intelligence layer. Reads and analysis are isolated from the legacy Sidekick. Sales Order writes are available only through the Phase 4 persisted approval boundary.

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
- Deterministic multi-step fulfilment assessment combining customer, item, official price, system stock, and open PO coverage
- Deterministic issued-invoice sales comparison with revenue growth, AOV, customer concentration, and salesperson concentration
- Boardroom-style sales synthesis with explicit scope, evidence, concentration risks, prioritized actions, and KPIs
- Current receivables aging and customer concentration
- Header-level Sales Order and Purchase Order pipeline workload
- Monthly gross profit and brand contribution using a disclosed current-purchase-rate cost basis
- Portfolio-level inventory exception and sales-velocity analysis
- Source-aware Varindo and official Zoho Books knowledge retrieval, separated from live business data
- Explicit PO coverage completeness when Zoho has more than 200 open Purchase Orders
- Visible, sanitized tool activity after a response

JARVIS cannot write directly from an agent tool. It may persist a Sales Order preview for 30 minutes. A separate exact `APPROVE CREATE SO` request atomically claims the preview, revalidates official prices, and creates one Draft Sales Order. Replayed, expired, cross-conversation, or altered approvals are rejected. Updates and all other writes remain disabled.

Apply `supabase/jarvis_pending_actions.sql` before testing the approval flow. The table uses service-role-only access with RLS enabled; no browser-side Supabase access is used.

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
11. Ask `Profitto needs 30 sheets of WY5210D. Can we fulfil it and what should we do?` and confirm JARVIS resolves both records, uses the fulfilment analysis tool, distinguishes immediate stock from future PO coverage, and does not create an SO.
12. Ask JARVIS to prepare an SO and verify a preview appears without a Zoho write.
13. Type exactly `APPROVE CREATE SO` and verify one Draft SO is created. Repeat the command and verify it is rejected as already used.

Phase 4 adds persisted, one-time Sales Order approvals. All operational answers must identify Zoho Books as their source; list results are summaries, exact document tools provide detail, and open PO quantities are not treated as received stock.

## Migration and proactive design

- `/sidekick` redirects to `/jarvis`; JARVIS is the single visible intelligence identity.
- The legacy chat implementation remains temporarily available to non-JARVIS internal callers but is no longer a user-facing intelligence page.
- `lib/jarvis/proactive/signals.ts` provides pure, deterministic anomaly hooks. No uncontrolled scheduler or background write is enabled.
- WhatsApp and always-listening voice remain future transport channels; they do not become separate intelligence systems.
