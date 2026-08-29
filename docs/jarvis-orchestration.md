# JARVIS orchestration layer

JARVIS is one internal VIA agent. It uses the existing native OpenAI Agents SDK loop: model, structured tool call, observation, then either another necessary tool call or a final answer. VIA does not create separate sales, finance, or operations agents.

## Context builder

Before a run, deterministic code builds the smallest practical package: authenticated role permissions, up to six recent relevant conversation messages (maximum 6,000 characters), Jakarta date/time, any explicit workflow state, relevant policies, and only registry tools that match the request domain and risk. It is not a second AI agent. Tool outputs remain native structured observations within the current Agents SDK run, so raw Zoho data is not duplicated into the prompt or retained in logs.

## Request routing and context

Each run receives a small deterministic routing profile: goal, likely intent, capability domains, whether live data is likely needed, requested risk level, and only clearly detectable missing action fields. This is a routing hint, not business evidence. The model receives recent relevant chat history only; it does not receive the full Zoho database or raw run traces.

## Controls

- Default maximum tool calls: 6 (`JARVIS_MAX_TOOL_CALLS`, range 1–12).
- Default maximum identical calls: 1 (`JARVIS_MAX_IDENTICAL_TOOL_CALLS`, range 1–3).
- Default maximum execution time: 45 seconds (`JARVIS_MAX_EXECUTION_MS`, range 5–55 seconds).
- Existing model-turn cap remains `JARVIS_MAX_TURNS`, default 8 and range 2–12.
- Duplicate calls and limits return structured non-retryable errors, so the model can stop with the best verified evidence.
- Tool failures distinguish ambiguity, validation, permissions, rate limiting, timeout, Zoho unavailability, and internal failure.

## Approval and data protection

`prepare_sales_order` can only make a persisted preview. The existing approval endpoint still requires the exact `APPROVE CREATE SO` command, claims the approval atomically, revalidates official pricing, and creates the Zoho draft. No JARVIS loop retry can create a duplicate Sales Order.

## Safe observability

Every run emits a compact `[jarvis.run]` Cloud Run log event containing run ID, routing intent/domains, tool names/order, count, outcome, duration, model, and error codes. Tool events contain only input field names and item counts—never raw customer names, IDs, conversation text, values, or hidden reasoning. This trace is ready for a future Agent Run screen.
