# VIA — Scenario Analysis (Phase 12)

## Scenario ≠ forecast

A forecast (`lib/metrics/forecast.ts`) extrapolates from history. A scenario (`lib/metrics/scenario.ts`) never looks at history at all — it applies deterministic arithmetic to a baseline value and a management-supplied assumption. Every `ScenarioResult` carries a structural `scenario: true` marker and a fixed `disclaimer` string ("This is a scenario, not a forecast or prediction...") — a caller cannot accidentally present one as the other, and the field exists precisely so downstream code/UI can check it.

This generalizes a pattern that already existed pre-Phase-12: `lib/jarvis/intelligence/business.ts`'s `modelCustomerRecoveryScenario` (a customer-revenue-recovery scenario, unchanged, still in use by `run_customer_recovery_scenario`) established the "arithmetic + a fixed assumptions-disclosure list" shape this phase's `runScenario()` generalizes to any metric.

## The engine

```ts
runScenario({ metricId, metricLabel, baselineValue, assumptionLabel, assumptionType: 'ABSOLUTE' | 'PERCENT', assumptionDelta })
```

`ABSOLUTE` replaces the baseline outright (e.g. "conversion rate becomes 25%"); `PERCENT` applies the delta multiplicatively (e.g. "AOV increases 10%" → `assumptionDelta: 0.1`). Both return `assumedValue`, `absoluteChange`, and `percentChange` (null when the baseline is 0, never `Infinity`).

## Named presets matching the brief's own examples (section 23)

- **`scenarioQuotationConversionChange`** — "What if quotation conversion increases from 20% to 25%?" Given the current quotation count and average order value, computes `additionalOrders` and `additionalSalesOrderValue`.
- **`scenarioAverageOrderValueChange`** — "What if average order value increases 10%?" Given the current order count, computes `additionalSalesOrderValue`.

Both are exposed via `lib/jarvis/tools/decisionEngineering.ts`'s `run_business_scenario` tool (`scenarioType: 'QUOTATION_CONVERSION' | 'AVERAGE_ORDER_VALUE' | 'GENERIC'`), which also accepts a fully generic scenario for any other governed metric.

## Deliberately not built as a named preset

"What if vendor response time improves by 1 day?" (the brief's third example) has no deterministic, already-established link in VIA's data between vendor response time and a downstream business KPI (order value, conversion) — inventing one would be exactly the "LLM performs business-critical arithmetic" or fabricated-relationship failure mode section 24 forbids. The generic `runScenario()` engine can model it the moment management states the assumed relationship explicitly (e.g. "assume this reduces the OOS-driven quotation drop-off by X pp") — that assumption is the caller's to supply, not this engine's to invent.

## Non-negotiables enforced in code, not just documentation

- `scenario: true` is present on every result — Test 47.
- `disclaimer` always states this is not a forecast.
- Recovery-rate and conversion-rate inputs are range-validated (0–1) and throw rather than silently clamp.
- `lib/metrics/scenario.test.ts` covers both named presets and the generic engine.
