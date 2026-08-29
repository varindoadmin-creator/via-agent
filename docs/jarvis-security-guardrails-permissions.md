# JARVIS guardrails, security, and permissions

## Enforcement boundary

JARVIS uses server-side policy checks, not model instructions or hidden UI controls, before every registered tool invocation and before the Sales Order write endpoint. The current product has shared role sessions (`director` and `admin`), not individual-user accounts. The identity is therefore explicitly marked as role-scoped; it must not be interpreted as a person-level audit identity.

Every run carries a non-user-controlled organization identifier, session identifier, role and resolved permissions. Memory and governed knowledge repositories are queried with that organization identifier, and policy rejects a resource whose organization differs from the run identity.

## Permission and action model

- Read / analyze / prepare actions are distinct from write and high-risk actions.
- Current Director permissions cover the existing read, analysis, governed-knowledge and Sales Order preview tools. Admin receives chat access only until a business permission model is defined.
- A Sales Order preview does not create a Zoho record. The separate write requires a current, single-use approval row, matching conversation and role, price revalidation, and idempotent claim state.
- Disabled or unauthorized actions return stable decision codes, including `PERMISSION_DENIED`, `CROSS_TENANT_BLOCKED`, `READ_ONLY_MODE`, `TOOL_DISABLED`, and `APPROVAL_REQUIRED`.

## Kill switches

Set environment values to `false` (or `true` for read-only) and redeploy:

| Variable | Effect |
| --- | --- |
| `JARVIS_RAG_ENABLED=false` | Disable knowledge retrieval |
| `JARVIS_MEMORY_WRITE_ENABLED=false` | Disable long-term memory writes |
| `JARVIS_WRITES_ENABLED=false` | Block JARVIS writes |
| `JARVIS_HIGH_RISK_ENABLED=false` | Block high-risk actions |
| `JARVIS_READ_ONLY=true` | Block all write and high-risk actions |
| `JARVIS_DISABLED_TOOLS=tool_a,tool_b` | Disable named tools without code changes |
| `JARVIS_BULK_LIMIT=100` | Maximum protected-action batch size |

## Context, knowledge, and prompt injection

Attachments, memory, and knowledge are treated as untrusted data. They are labelled before reaching the model and never become instructions. Injection-like phrases produce a redacted structured security event. Raw document text, business identifiers, request inputs, secrets, and tokens are not written to those security events.

Knowledge retrieval is organization- and role-filtered before context construction. Memory storage rejects secrets, instruction-like content, and volatile live facts. Current Zoho/VIA tools remain authoritative for live business data.

## Audit, validation, and limits

The tool registry logs only tool name, category, risk, field names, count, timing, and stable result code. The security event stream records authorization outcomes and untrusted-content signals without the underlying data. Tool-call, duplicate-call, execution-time, ambiguity, and bulk limits are enforced in code.

## Tests and release gate

`npm run test:jarvis` includes policy and untrusted-content unit tests. These cover role denial, organization isolation, approval binding, read-only and disabled-tool switches, ambiguous/bulk action refusal, and prompt-injection labelling. Approval expiry and replay prevention are enforced by the existing pending-claim storage flow; fixture evaluation remains a deterministic harness and is not evidence of live-model safety. Production model evaluations must run against approved synthetic fixtures before enabling new write tools.

Before enabling a new action: add its permission, risk, organization scope, input validation, idempotency behavior, approval requirements, security tests, and a kill switch. Deletes, voids, financial changes, customer messaging, bulk operations, and permission changes remain disabled unless separately implemented and reviewed.
