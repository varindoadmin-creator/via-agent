# VIA Evaluation and Release Gates

The evaluation framework itself (architecture, suites, scoring, CI gate, and its own documented reliability boundary — it is a deterministic contract/safety harness, not yet a live-model evaluator) is documented in `docs/jarvis-evaluation-engineering.md` and is not repeated here.

## What Phase 13 adds: release-blocking gap-fill

Brief section 29 lists eleven release-blocking categories. Cross-checked against the 44 pre-existing cases in `lib/jarvis/evals/cases.ts`:

| Category | Status before Phase 13 | Case |
|---|---|---|
| Pricing leakage | Partially covered (live-price-overrides-memory, `MEM-LIVE-001`) | — |
| Tier leakage | **Gap — added** | `SAFE-TIER-001` |
| Wrong customer data | Covered | `SAFE-TENANT-001` |
| Stock hallucination | Covered | `REG-TIMEOUT-001` |
| Wrong bank account | **Gap — added** | `SAFE-BANK-001` |
| Unsupported products | **Gap — added** | `SAFE-UNSUPPORTED-PRODUCT-001` |
| Permission bypass | Covered | `PERM-VOID-001` |
| Duplicate order | **Gap — added** | `SAFE-DUPLICATE-ORDER-001` |
| Wrong payment claim | **Gap — added** | `SAFE-PAYMENT-CLAIM-001` |
| Prompt injection | Covered | `SAFE-INJECT-001` |
| Human takeover violation | Covered at the unit-test level (see below), not as a Jarvis eval case — Jarvis itself never sends WATI messages, so this is a WATI-pipeline property, not a Jarvis-agent property | — |

All five new cases are `critical: true` (they block their suite on failure) and were added to both the `golden` and `safety` suites. `npm run eval:jarvis` now reports 49 total cases, 49 passing, 0 critical failures.

## Production-reliability tests (brief sections 53-62) — distinct from the Jarvis eval-fixture cases above

These are real `node --experimental-strip-types --test` tests over actual code paths, not the offline eval harness:

| # | Test | Status | Where |
|---|---|---|---|
| 53 | Zoho outage → no price/payment/order hallucination | Already covered | `REG-TIMEOUT-001` eval case; `lib/integrations/wati/*` intent/pricing tests |
| 54 | WATI duplicate → dedupe | Already covered | `lib/integrations/wati/webhook.test.ts` |
| 55 | Send retry → exactly one customer message | Already covered (`sendOutreach.ts`'s version-conflict → `DUPLICATE_PREVENTED`) + **new**: job-queue backoff/DLQ test | `lib/proactiveActions/store.test.ts`, `lib/jobs/queue.test.ts` |
| 56 | Human takeover race → no AI send after takeover | **Gap — added** (the pipeline's `isNowHumanOwned` recheck had no direct unit test; the full pipeline has no dedicated test file) | `lib/integrations/wati/pipelineRace.test.ts` |
| 57 | Model failure → safe fallback | Covered by construction (`app/api/jarvis/chat/route.ts`'s catch-all + `classifyJarvisFailure`/`safeFailureMessage`), not by an isolated unit test — mocking the OpenAI agent run itself was judged not worth the brittleness it would add | `app/api/jarvis/chat/route.ts`, `lib/jarvis/reliability/errors.ts` |
| 58 | Tier leak → release blocking | Already covered at the disclosure layer (`lib/security/disclosure/*.test.ts`); **new**: Jarvis-level eval case | `SAFE-TIER-001` |
| 59 | Wrong customer → cross-customer leak, release blocking | Already covered | `SAFE-TENANT-001`, `lib/jarvis/security/policy.test.ts` |
| 60 | Unknown Zoho write → reconcile before retry | Already covered | `lib/commercialApprovals/executeCommercialDraft.test.ts`, `lib/jarvis/reliability/reliability.test.ts` |
| 61 | Security tests (injection, auth bypass, IDOR, malformed webhook, oversized payload, role escalation, sensitive logs) | Malformed webhook and oversized payload already covered (`lib/integrations/wati/webhook.test.ts`); auth bypass/IDOR/role escalation already covered (`lib/jarvis/security/policy.test.ts`); no new gap found | `lib/integrations/wati/webhook.test.ts`, `lib/jarvis/security/policy.test.ts` |
| 62 | Load test | **New** — `scripts/load-test-webhook.ts`, a local dev tool, not CI-gated | see below |

## Load testing

`scripts/load-test-webhook.ts` fires N concurrent synthetic WATI webhook payloads at a locally-running `npm run dev` server and reports p50/p95/p99 latency and error rate. It is a manual dev tool (`node --experimental-strip-types scripts/load-test-webhook.ts --concurrency=10 --total=100`), not wired into `npm test` or CI — running it against a shared/production URL would send real (if synthetic-content) webhook-shaped traffic through the real pipeline, which is not something to automate without explicit intent.

**"Reasonable traffic" for VIA's actual scale**: VIA is a single-company internal system, not a consumer product. `CRON_SCHEDULE.md`'s cadence (daily batch jobs, a handful of sweeps every 5-15 minutes) and the existing docs' framing (`docs/jarvis-deployment-scalability-continuous-improvement.md`: "do not add queues, caches, or workers until measured need demonstrates it") both imply a traffic profile of **tens of inbound WhatsApp messages per hour, not per second**, and a handful of concurrent internal admin/director sessions. The load test's default parameters (10 concurrent, 100 total) deliberately overshoot this by a wide margin as a safety margin check, not because it reflects expected load.
