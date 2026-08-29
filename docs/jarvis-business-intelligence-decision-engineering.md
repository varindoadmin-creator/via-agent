# JARVIS Business Intelligence & Decision Engineering

## Purpose and scope

JARVIS converts verified VIA and Zoho Books observations into evidence-led management support. It does not replace accounting, approve commercial decisions, create records, contact customers, or claim that an analysis proves a cause.

Version 1 covers issued-invoice sales comparison, customer/salesperson contribution, declining/inactive-customer prioritisation, recovery scenarios, existing receivables ageing, current-purchase-rate gross profit, and system-stock inventory exceptions. Product cross-sell, reorder-cycle prediction, historical landed-cost profitability, cash forecasting, supplier lead-time forecasts, and a composite business-health score are deliberately out of scope until their source coverage is verified.

## Semantic metric registry

The code-owned registry is `lib/jarvis/intelligence/business.ts` (`BUSINESS_METRIC_REGISTRY`). Every registered metric documents its formula, source fields, source system, limitation, and version. Key rules:

- Revenue is issued-invoice subtotal before PPN; draft and void invoices are excluded.
- Gross profit uses current Zoho item purchase rate × invoiced quantity and is not historical landed-cost accounting.
- Receivable ageing uses open invoice balance and due date; missing due dates remain visible.
- Days of stock uses system availability and recent sales velocity; it is never a physical-stock or lead-time guarantee.
- Period comparisons must carry explicit `from`, `to`, and labels. Month-to-date comparisons should use equal elapsed days.

## Evidence and decisions

Each response must distinguish **FACT**, **INFERENCE**, **HYPOTHESIS**, **ASSUMPTION**, and **RECOMMENDATION** when material. Tools return source, basis, coverage limits, and deterministic outputs. A sales driver shows where movement occurred; it does not prove why. A scenario applies arithmetic to an explicitly supplied assumption; it is not a forecast.

Recommendations are bounded to the top three candidates and include evidence, expected impact, effort, a guardrail, and a KPI. In v1, customer follow-up is prepared for human approval only—no message, pricing change, order, PO, or credit action is executed.

## Available controlled analytics

| Tool | Evidence | Output | Boundary |
| --- | --- | --- | --- |
| `analyze_sales_periods` | Issued invoices | Revenue, invoice count, AOV, concentration | No root-cause claim |
| `analyze_sales_drivers` | Two explicit issued-invoice periods | Customer and salesperson contribution | Does not prove causality |
| `identify_customer_opportunities` | Two comparable issued-invoice periods | Declining/inactive candidates and approval-ready follow-ups | No automatic outreach or credit decision |
| `run_customer_recovery_scenario` | Same verified periods + user recovery-rate assumption | Recovered-revenue arithmetic | Not a forecast; no GP/cash claim |
| `analyze_receivables` | Current open invoices | Balance, ageing, concentration | Missing due dates disclosed |
| `analyze_gross_profit` | Invoice details + current item rates | Monthly GP and brand contribution | Current-rate basis only |
| `analyze_inventory_risk` | Active items + sales velocity | Advisory stock exceptions | System stock only |

## Safety, observability, and evaluation

All JARVIS tools are role-authorised, scoped by the deterministic context builder, audited, rate-limited, timeout-bounded, and protected by the existing dependency circuit breaker. The BI primitives are pure functions and have unit tests for driver attribution, decline/inactivity classification, and scenario bounds. Tool failures are reported as unavailable evidence, not replaced with generated values.

## Demonstrable scenarios

1. “Why are sales down this month?” → compare equal elapsed periods, return customer/salesperson contribution, label root cause as unknown unless additional evidence exists.
2. “Which customers should the team call?” → return only declining/inactive customers plus up to three approval-ready follow-up suggestions.
3. “What if we recover 25% of Customer A’s lost sales?” → return arithmetic estimate and assumptions, never a revenue forecast.
4. “What is this month’s GP?” → use monthly GP tool, disclose current-purchase-rate basis and missing-cost coverage.
5. “What should management focus on?” → gather only relevant verified sales, AR, inventory, operations, and GP tools; explicitly mark any unavailable domain.
