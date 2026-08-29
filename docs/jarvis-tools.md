# JARVIS Tool Layer

JARVIS uses one centrally registered tool catalog in `lib/jarvis/tools/registry.ts`. The catalog is a governance layer over existing VIA and Zoho Books services; it does not create a second Zoho client, store, or approval path.

## Access and safety

- The current JARVIS API is director-only. The registry enforces the same policy before every tool invocation.
- `READ` tools retrieve verified current VIA or Zoho Books data.
- `ANALYZE` tools make deterministic calculations from verified data and do not modify anything.
- `PREPARE` tools may persist a non-executing approval preview. `prepare_sales_order` is the only current preparation tool.
- `WRITE` and `HIGH_RISK` tools are deliberately not exposed to the agent. The only supported Sales Order creation route is the existing approval service after the exact command `APPROVE CREATE SO`, revalidation, and audit record.
- No tool may fabricate prices, stock, document status, customers, or financial results. Static knowledge is never proof of live business data.

## Available catalog

| Category | Capabilities | Risk |
| --- | --- | --- |
| Customer | Search and retrieve customers | READ |
| Products | Search and retrieve items | READ |
| Sales | Customer price, Sales Order search/detail, operational pipeline | READ / ANALYZE |
| Inventory | System stock and fulfilment / inventory-risk analysis | READ / ANALYZE |
| Purchasing | Purchase Order search/detail and open-PO coverage | READ |
| Finance | Receivables and monthly gross-profit analysis | ANALYZE |
| Analytics | Sales-period comparison and boardroom sales brief | ANALYZE |
| Knowledge & system | Policy search and VIA feature discovery | READ |
| Protected action | Persisted Sales Order preview only | PREPARE |

Each tool definition includes its model-facing description, category, risk, required role, source, input contract, output contract, and actual handler. Tool parameters remain the strict Zod schemas already owned by the established implementation.

## Observability and errors

Every invocation writes a structured `jarvis.tool` event to Cloud Run logs containing tool name, category, risk, authenticated role, request/conversation references, timestamp, safe input-field summary, duration, success, and error code. Raw arguments, customer names, IDs, and other business values are never added to that log event.

Expected failures return a structured error to the agent with a stable code such as `INSUFFICIENT_PERMISSION`, `AMBIGUOUS_MATCH`, `NOT_FOUND`, `ZOHO_UNAVAILABLE`, or `TOOL_EXECUTION_FAILED`. A tool failure does not change a Zoho record.

## Adding a capability

1. Implement or reuse the underlying VIA/Zoho service first, with its own validation and tests.
2. Add one entry to the central registry with its true risk level, source, permission, and contracts.
3. For any write, route it through the existing approval and revalidation pattern. Do not expose a direct write tool.
4. Add tests for the underlying service and registry behavior, then update this catalog.
