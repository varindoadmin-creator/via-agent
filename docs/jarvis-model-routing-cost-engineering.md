# JARVIS model routing and cost engineering

## Scope

JARVIS remains a single agent. The centralized model gateway selects an eligible OpenAI model before each run; it does not create specialist agents or let the model select its own provider.

## Routing policy

`lib/jarvis/models/router.ts` derives deterministic requirements from the existing orchestration profile:

| Tier | Typical requests | Minimum reasoning | Default output budget |
| --- | --- | --- | ---: |
| `SIMPLE` | current stock, status, explanation | low | 700 |
| `STANDARD` | comparison, analysis, SO preparation | medium | 1,200 |
| `COMPLEX` | diagnosis, recommendation, cross-domain work | high | 2,000 |
| `CRITICAL` | direct write workflows | high | 1,500 |

Eligibility requires the necessary reasoning, tool/structured-output support, context capacity, and approval for financial/confidential data. A cheap model is never selected when it does not meet those requirements.

The existing security and approval gates remain authoritative; model routing cannot grant write permission.

## Configuration

- `JARVIS_MODEL_ROUTING_ENABLED=false` — reversible legacy single-model mode.
- `JARVIS_FORCE_MODEL` — operator-only diagnostic override. It is rejected if the named model is ineligible.
- `JARVIS_MODEL_FAST`, `JARVIS_MODEL_STANDARD`, `JARVIS_MODEL_COMPLEX`, `JARVIS_MODEL_CRITICAL` — model IDs. Each falls back to the existing `JARVIS_MODEL`, then `gpt-5-mini`, preserving current deployment behavior until distinct validated models are configured.
- `JARVIS_<TIER>_MAX_OUTPUT_TOKENS` — bounded output budget (128–8,000).
- `JARVIS_MODEL_<TIER>_INPUT_PER_MILLION_USD`, `...OUTPUT_PER_MILLION_USD`, optional `...CACHED_INPUT_PER_MILLION_USD` — current provider pricing metadata. Pricing is intentionally unset by default, so VIA never presents stale hard-coded price estimates as facts.
- `JARVIS_WARN_ESTIMATED_RUN_COST_USD` and `JARVIS_MAX_ESTIMATED_RUN_COST_USD` — logging signals for monitoring. They do not block a verified business request in v1.
- `JARVIS_MODEL_ROUTING_CONFIG_VERSION` — reproducible route configuration version.

## Cost, quality, and reliability

The gateway records concise routing metadata, normalized SDK token usage, latency, estimated cost (when pricing is configured), model request count, and cost-alert state in the server run log. It records no hidden reasoning.

Model quality is not presumed: the model registry is capability metadata, not proof. Existing offline evaluations provide the initial routing evidence; validate each configured candidate in the relevant lookup, analysis, preparation, and safety suites before assigning it to production tiers. The model route includes compatible fallback candidates for the reliability layer; v1 does not replay failed agent runs automatically because tool observations may already have occurred.

## Cost controls

Output and agent-turn limits, selective tools, existing context/memory/knowledge limits, tool-loop controls, and timeout/concurrency guards prevent runaway work. Current changing business data is never served from a model-answer cache. Exact IDs, arithmetic, authorization, date calculation, filtering, and Zoho lookup remain deterministic software paths wherever possible.

## Operations

Use `npm run test:jarvis` for offline routing/cost regressions and `npm run eval:jarvis` for fixture evaluation. A configuration rollback is achieved by setting `JARVIS_MODEL_ROUTING_ENABLED=false` or rolling back the Cloud Run revision. Model or pricing changes should be versioned with `JARVIS_MODEL_ROUTING_CONFIG_VERSION` and followed by eval review.
