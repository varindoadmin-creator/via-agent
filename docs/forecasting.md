# VIA — Forecasting (Phase 12)

## Principle

Transparent methods only — no ML, no black box (brief section 20). `lib/metrics/forecast.ts`'s `forecastSeries(history, horizon, method, metricId?)` implements three methods:

- **`MOVING_AVERAGE`** (default) — flat forecast at the mean of the last 3 periods.
- **`EXPONENTIAL_SMOOTHING`** — simple (non-trended) exponential smoothing, α = 0.3.
- **`LINEAR_TREND`** — ordinary least-squares line fit, extrapolated forward.

## The non-negotiable: no fake forecast on thin history

`MIN_HISTORY_POINTS = 6`. Below that, `forecastSeries` returns `{ status: 'INSUFFICIENT_DATA', reason: '...' }` with no `points` field at all — never a number computed from 2-3 data points dressed up as a forecast. This is enforced in code, not left to the caller's judgment (`lib/metrics/forecast.test.ts`'s first test asserts `result.points === undefined` in this case).

## Every result discloses its own quality (brief section 21)

An `OK` result always carries: `method`, `horizon`, `trainingWindow` (how many periods it was fit on), `dataSufficiency` (a plain-language note — "minimal, treat the band as wide" below the threshold), and `lastUpdated`. It is never returned bare as a number.

## Uncertainty band

Each `ForecastPoint` carries `lowerBound`/`upperBound` computed from the in-sample one-step-ahead residual standard deviation, widened by `√(stepsAhead)` — a simple, disclosed heuristic (not a formal statistical confidence interval; the code comments say so explicitly). The band is floored at 0 on the lower side (a forecast quantity can't reasonably go negative for the metrics this feeds — order value/count, inquiry count).

## What VIA forecasts today

`lib/jarvis/tools/decisionEngineering.ts`'s `forecast_metric` tool supports three series, each built from existing tables bucketed by calendar month (no new event stream):

| `metricId` | Source |
|---|---|
| `sales_order_value` | `commercial_drafts` where `type=SALES_ORDER, status=COMPLETED`, summed by month |
| `sales_order_count` | Same rows, counted by month |
| `inquiry_count` | `wati_messages` inbound rows, counted by month |

## Observability

`forecast.generated` fires on every `OK` result, `forecast.insufficient_data` on every rejection — both through the existing `analytics_events` pipeline (gated by `ANALYTICS_EVENT_PIPELINE_ENABLED`), so management can see how often forecasting is actually usable versus data-starved.

## Known limitations

- No seasonal-baseline method yet (brief section 20 lists it as a possibility) — VIA's WATI-era history is under 2 years, too short to reliably estimate a yearly seasonal component; deferred rather than built on insufficient data.
- Forecasts are monthly-grain only; no weekly/quarterly forecast horizon.
- The uncertainty band is a heuristic, not a proper prediction interval from the fitted model's own distributional assumptions — acceptable for a first pass per the brief's own "start simple" instruction (section 20), but should not be read as a formal statistical guarantee.
