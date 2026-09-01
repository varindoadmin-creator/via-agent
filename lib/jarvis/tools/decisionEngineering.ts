// ─── BI & Decision Engineering Jarvis tools (Phase 12) ────────────────────────
// Internal-only, registered ONLY in the internal tool registry (lib/jarvis/
// tools/registry.ts), which the WATI pipeline never imports — unreachable
// from any external/WATI audience by construction (brief section 38's "no
// management BI for external customers", satisfied structurally, the same
// guarantee every other internal-only tool file in this codebase relies on).
// Every tool here is a thin wrapper over a deterministic lib/metrics/*
// function or an existing governed analytics function — never an
// independent computation, and never a raw-table scan Jarvis improvises
// itself (brief section 2's non-negotiable).

import { tool } from '@openai/agents';
import { z } from 'zod';
import type { JarvisRunContext } from '@/lib/jarvis/context';
import { cached } from '@/lib/jarvis/cache';
import { supabaseSelect } from '@/lib/supabase/rest';
import { GOVERNED_METRIC_REGISTRY, getGovernedMetric } from '@/lib/metrics/registry';
import { classifyCustomerSegmentsBatch, segmentCounts, type CustomerActivityFacts } from '@/lib/metrics/segmentation';
import { calculateConcentration } from '@/lib/jarvis/intelligence/metrics';
import { paretoBreakdown, describeConcentrationMagnitude, type NamedValue } from '@/lib/metrics/concentration';
import { computeCustomerRetention } from '@/lib/metrics/retention';
import { buildCohortRetentionTable, type CustomerActivityRecord } from '@/lib/metrics/cohort';
import { forecastSeries, type HistoryPoint, type ForecastMethod } from '@/lib/metrics/forecast';
import { runScenario, scenarioQuotationConversionChange, scenarioAverageOrderValueChange } from '@/lib/metrics/scenario';
import { decomposeMetricChange, type DimensionValue } from '@/lib/metrics/whatChanged';
import { buildDecisionBrief, type DriverCategory } from '@/lib/metrics/decisionEngine';
import { decomposeSalesChange } from '@/lib/jarvis/intelligence/business';
import { getExtendedDataQualityReport } from '@/lib/metrics/dataQuality';
import { getCashCollected } from '@/lib/metrics/cashCollected';
import { recordDecision, getDecision, listDecisions, reviewDecision, type LinkedFindingType } from '@/lib/metrics/decisionStore';
import { createExperiment, getExperiment, listExperiments, recordExperimentResult } from '@/lib/metrics/experimentStore';
import { fetchInvoices, observations, validatePeriod } from './analytics';
import { resolveTimeGrain } from '@/lib/analytics/periods';
import { isAnalyticsEventPipelineEnabled } from '@/lib/customerIdentity/featureFlags';
import { recordAnalyticsEvent } from '@/lib/analytics/events';

type Row = Record<string, unknown>;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const emptyParams = z.object({});

function emit(eventType: 'metric.queried' | 'forecast.generated' | 'forecast.insufficient_data' | 'scenario.executed' | 'decision.recorded' | 'data_quality.issue', sourceId: string): void {
  if (!isAnalyticsEventPipelineEnabled()) return;
  void recordAnalyticsEvent({ eventType, sourceId, source: 'JARVIS_BI' });
}

// ── 1. Metric registry ──────────────────────────────────────────────────────

const metricLookupParams = z.object({ metricId: z.string().nullable(), owner: z.enum(['SALES', 'FINANCE', 'OPERATIONS', 'MANAGEMENT', 'CUSTOMER_SERVICE']).nullable() });

export const getGovernedMetricDefinitionTool = tool<typeof metricLookupParams, JarvisRunContext>({
  name: 'get_governed_metric_definition',
  description: 'Look up one or all governed metric definitions (formula, grain, source, currency basis, owner, classification). Use this before quoting any KPI name/formula to a user — never invent a metric definition.',
  parameters: metricLookupParams,
  async execute({ metricId, owner }) {
    if (metricId) {
      const metric = getGovernedMetric(metricId);
      return metric ? { kind: 'governed_metric', metric } : { kind: 'governed_metric', error: `No governed metric named "${metricId}". Use metricId: null to list all.` };
    }
    const metrics = owner ? GOVERNED_METRIC_REGISTRY.filter(m => m.owner === owner) : GOVERNED_METRIC_REGISTRY;
    return { kind: 'governed_metric_list', count: metrics.length, metrics };
  },
});

// ── 2. Customer segmentation (VIA-tracked commercial_drafts activity) ──────────

interface DraftAggRow { customer_id: string | null; type: string; status: string; total: number | null; created_at: string }

async function buildCustomerActivityFacts(): Promise<CustomerActivityFacts[]> {
  const rows = await supabaseSelect<DraftAggRow>('commercial_drafts', 'customer_id=not.is.null&select=customer_id,type,status,total,created_at&limit=5000');
  const byCustomer = new Map<string, CustomerActivityFacts>();
  for (const row of rows) {
    if (!row.customer_id) continue;
    const facts = byCustomer.get(row.customer_id) ?? {
      customerId: row.customer_id, firstOrderDate: null, lastOrderDate: null,
      orderCount: 0, totalOrderValue: 0, quotationCount: 0, sampleRequestCount: 0,
    };
    if (row.type === 'QUOTATION') facts.quotationCount++;
    if (row.type === 'SALES_ORDER' && row.status === 'COMPLETED') {
      facts.orderCount++;
      facts.totalOrderValue += row.total ?? 0;
      if (!facts.firstOrderDate || row.created_at < facts.firstOrderDate) facts.firstOrderDate = row.created_at;
      if (!facts.lastOrderDate || row.created_at > facts.lastOrderDate) facts.lastOrderDate = row.created_at;
    }
    byCustomer.set(row.customer_id, facts);
  }
  return [...byCustomer.values()];
}

export const getCustomerSegmentsTool = tool<typeof emptyParams, JarvisRunContext>({
  name: 'get_customer_segments',
  description: 'Compute deterministic analytical customer segments (RECENT_ACTIVE, REPEAT_CUSTOMER, HIGH_ORDER_FREQUENCY, HIGH_VALUE, LAPSED, NEW, QUOTE_ONLY, SAMPLE_ONLY) from VIA-tracked commercial drafts. This is NEVER the pricing Tier — it never reads or changes Zoho customer Tier.',
  parameters: emptyParams,
  async execute(_input, context) {
    const facts = await cached(context, 'bi:customer-activity-facts', buildCustomerActivityFacts);
    const results = classifyCustomerSegmentsBatch(facts);
    emit('metric.queried', 'customer_segments');
    return {
      kind: 'customer_segments', customerCount: results.length, counts: segmentCounts(results),
      limitation: 'Computed from VIA-tracked commercial_drafts only — customers whose orders never touched VIA (phone, walk-in, direct Zoho entry) are not represented. This is an analytical segment, distinct from and never overwriting the Zoho pricing Tier.',
    };
  },
});

// ── 3. Customer concentration (Zoho invoices, Pareto) ──────────────────────────

const periodParams = z.object({ from: date, to: date, topPercent: z.number().min(1).max(100).default(20) });

export const getCustomerConcentrationTool = tool<typeof periodParams, JarvisRunContext>({
  name: 'get_customer_concentration',
  description: 'Analyze customer revenue concentration from live Zoho issued invoices for one date range: top-5/top-10 customers and what share of revenue the top X% of customers account for (Pareto). Concentration is reported as a magnitude only — it is not automatically labeled a problem.',
  parameters: periodParams,
  async execute({ from, to, topPercent }, context) {
    const invoices = await cached(context, `bi:invoices:${from}:${to}`, () => fetchInvoices(from, to));
    const byCustomer = new Map<string, number>();
    for (const invoice of invoices) {
      const name = String(invoice.customer_name || 'Unassigned');
      byCustomer.set(name, (byCustomer.get(name) || 0) + Number(invoice.sub_total || 0));
    }
    const rows: NamedValue[] = [...byCustomer].map(([name, value]) => ({ name, value }));
    const top = calculateConcentration(rows, 10);
    const pareto = paretoBreakdown(rows, topPercent);
    emit('metric.queried', 'customer_concentration');
    return {
      source: 'Zoho Books issued invoices', from, to,
      topCustomers: top, pareto, magnitude: describeConcentrationMagnitude(top.top_share),
      note: 'Concentration magnitude is descriptive only — whether it is a risk depends on context this tool does not have.',
    };
  },
});

// ── 4. Product concentration (VIA-tracked commercial_draft_lines, canonical item_id) ──

interface LineAggRow { product_id: string | null; product_name: string | null; approved_unit_price: number | null; quantity: number }
interface InquiryAggRow { item_id: string | null }

export const getProductConcentrationTool = tool<z.ZodObject<{ topPercent: z.ZodDefault<z.ZodNumber> }>, JarvisRunContext>({
  name: 'get_product_concentration',
  description: 'Analyze product concentration (Pareto, by canonical Zoho Item ID) and identify high-inquiry/low-conversion products, from VIA-tracked commercial draft lines and inquiries. Never joins products by free-text name.',
  parameters: z.object({ topPercent: z.number().min(1).max(100).default(20) }),
  async execute({ topPercent }, context) {
    const [lines, inquiries] = await Promise.all([
      cached(context, 'bi:draft-lines', () => supabaseSelect<LineAggRow>('commercial_draft_lines', 'product_id=not.is.null&select=product_id,product_name,approved_unit_price,quantity&limit=5000')),
      cached(context, 'bi:inquiry-items', () => supabaseSelect<InquiryAggRow>('wati_messages', 'item_id=not.is.null&select=item_id&limit=5000')),
    ]);
    const valueByProduct = new Map<string, { name: string; value: number }>();
    for (const line of lines) {
      if (!line.product_id) continue;
      const entry = valueByProduct.get(line.product_id) ?? { name: line.product_name || line.product_id, value: 0 };
      entry.value += (line.approved_unit_price ?? 0) * line.quantity;
      valueByProduct.set(line.product_id, entry);
    }
    const inquiryCounts = new Map<string, number>();
    for (const row of inquiries) { if (row.item_id) inquiryCounts.set(row.item_id, (inquiryCounts.get(row.item_id) || 0) + 1); }

    const rows: NamedValue[] = [...valueByProduct].map(([id, v]) => ({ name: `${v.name} (${id})`, value: v.value }));
    const highInquiryLowSales = [...inquiryCounts.entries()]
      .map(([itemId, inquiryCount]) => ({ itemId, inquiryCount, orderValue: valueByProduct.get(itemId)?.value ?? 0 }))
      .filter(row => row.inquiryCount >= 5 && row.orderValue === 0)
      .sort((a, b) => b.inquiryCount - a.inquiryCount).slice(0, 20);

    emit('metric.queried', 'product_concentration');
    return {
      source: 'VIA-tracked commercial_draft_lines and wati_messages (canonical item_id)',
      topProducts: calculateConcentration(rows, 10), pareto: paretoBreakdown(rows, topPercent),
      highInquiryLowConversion: highInquiryLowSales,
      limitation: 'Covers VIA-tracked orders only, not all Zoho Sales Orders. Products joined exclusively by canonical Zoho item_id.',
    };
  },
});

// ── 5. Brand performance (LAMITAK / EDL only — brief section 10) ──────────────

interface BrandInquiryRow { brand: string | null }
interface BrandStockRow { brand: string | null; status: string }

export const getBrandPerformanceTool = tool<typeof emptyParams, JarvisRunContext>({
  name: 'get_brand_performance',
  description: "Compare inquiry volume and stock-issue rate between Varindo's two approved brands (LAMITAK, EDL) from WATI-tracked conversations. Order-value-by-brand and sample-requests-by-brand are NOT included — Zoho items carry no reliable brand field, so this tool does not fabricate a brand benchmark for those (see docs/product-enrichment.md).",
  parameters: emptyParams,
  async execute(_input, context) {
    const [inquiries, stockInquiries] = await Promise.all([
      cached(context, 'bi:brand-inquiries', () => supabaseSelect<BrandInquiryRow>('wati_messages', 'brand=not.is.null&select=brand&limit=5000')),
      cached(context, 'bi:brand-stock', () => supabaseSelect<BrandStockRow>('stock_inquiries', 'brand=not.is.null&select=brand,status&limit=5000')),
    ]);
    const byBrand = (rows: { brand: string | null }[]) => {
      const counts = new Map<string, number>();
      for (const row of rows) if (row.brand) counts.set(row.brand, (counts.get(row.brand) || 0) + 1);
      return Object.fromEntries(counts);
    };
    const stockByBrand = new Map<string, { total: number; oos: number }>();
    for (const row of stockInquiries) {
      if (!row.brand) continue;
      const entry = stockByBrand.get(row.brand) ?? { total: 0, oos: 0 };
      entry.total++;
      if (row.status === 'OUT_OF_STOCK') entry.oos++;
      stockByBrand.set(row.brand, entry);
    }
    emit('metric.queried', 'brand_performance');
    return {
      source: 'wati_messages / stock_inquiries brand field (LAMITAK, EDL only)',
      inquiryCounts: byBrand(inquiries),
      oosRateByBrand: Object.fromEntries([...stockByBrand].map(([brand, v]) => [brand, v.total > 0 ? v.oos / v.total : null])),
      notAvailable: ['order_value_by_brand', 'sample_requests_by_brand'],
      reason: 'Zoho items carry no reliable brand field this pass; fabricating a brand join would violate the no-fake-benchmark rule.',
    };
  },
});

// ── 6. Customer retention (Zoho invoices, two explicit periods) ──────────────

const retentionParams = z.object({ periodALabel: z.string(), periodAFrom: date, periodATo: date, periodBLabel: z.string(), periodBFrom: date, periodBTo: date });

export const getCustomerRetentionTool = tool<typeof retentionParams, JarvisRunContext>({
  name: 'get_customer_retention',
  description: 'Compute customer retention (not revenue retention) between two explicit Zoho issued-invoice periods: what share of Period A customers purchased again in Period B.',
  parameters: retentionParams,
  async execute({ periodALabel, periodAFrom, periodATo, periodBLabel, periodBFrom, periodBTo }, context) {
    const [a, b] = await Promise.all([
      cached(context, `bi:invoices:${periodAFrom}:${periodATo}`, () => fetchInvoices(periodAFrom, periodATo)),
      cached(context, `bi:invoices:${periodBFrom}:${periodBTo}`, () => fetchInvoices(periodBFrom, periodBTo)),
    ]);
    const result = computeCustomerRetention({
      periodALabel, periodACustomerIds: [...new Set(a.map(i => String(i.customer_name || '')))],
      periodBLabel, periodBCustomerIds: [...new Set(b.map(i => String(i.customer_name || '')))],
    });
    emit('metric.queried', 'customer_retention');
    return { source: 'Zoho Books issued invoices', ...result };
  },
});

// ── 7. Cohort analysis ──────────────────────────────────────────────────────

const cohortParams = z.object({ monthsBack: z.number().min(3).max(24).default(12) });

export const getCohortAnalysisTool = tool<typeof cohortParams, JarvisRunContext>({
  name: 'get_cohort_analysis',
  description: 'Build a first-invoice-month cohort retention table from live Zoho issued invoices over the trailing N months: for each cohort, what share is still active in each subsequent month.',
  parameters: cohortParams,
  async execute({ monthsBack }, context) {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - monthsBack * 30 * 86_400_000).toISOString().slice(0, 10);
    validatePeriod(from, to);
    const invoices = await cached(context, `bi:invoices:${from}:${to}`, () => fetchInvoices(from, to));
    const byCustomer = new Map<string, Set<string>>();
    for (const invoice of invoices) {
      const name = String(invoice.customer_name || 'Unassigned');
      const month = String(invoice.date || '').slice(0, 7);
      if (!month) continue;
      const set = byCustomer.get(name) ?? new Set<string>();
      set.add(month);
      byCustomer.set(name, set);
    }
    const records: CustomerActivityRecord[] = [...byCustomer].map(([customerId, months]) => ({ customerId, activityMonths: [...months] }));
    const table = buildCohortRetentionTable(records, Math.min(monthsBack - 1, 6), to.slice(0, 7));
    emit('metric.queried', 'cohort_analysis');
    return { source: 'Zoho Books issued invoices', from, to, cohorts: table };
  },
});

// ── 8. Forecasting ───────────────────────────────────────────────────────────

interface MonthlyDraftRow { total: number | null; created_at: string }
interface MonthlyMessageRow { received_at: string }

async function monthlySalesOrderSeries(): Promise<HistoryPoint[]> {
  const rows = await supabaseSelect<MonthlyDraftRow>('commercial_drafts', 'type=eq.SALES_ORDER&status=eq.COMPLETED&select=total,created_at&order=created_at.asc&limit=5000');
  const byMonth = new Map<string, { value: number; count: number }>();
  for (const row of rows) {
    const month = row.created_at.slice(0, 7);
    const entry = byMonth.get(month) ?? { value: 0, count: 0 };
    entry.value += row.total ?? 0; entry.count++;
    byMonth.set(month, entry);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, v]) => ({ period, value: v.value }));
}

async function monthlyOrderCountSeries(): Promise<HistoryPoint[]> {
  const rows = await supabaseSelect<MonthlyDraftRow>('commercial_drafts', 'type=eq.SALES_ORDER&status=eq.COMPLETED&select=total,created_at&order=created_at.asc&limit=5000');
  const byMonth = new Map<string, number>();
  for (const row of rows) { const month = row.created_at.slice(0, 7); byMonth.set(month, (byMonth.get(month) || 0) + 1); }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => ({ period, value }));
}

async function monthlyInquirySeries(): Promise<HistoryPoint[]> {
  const rows = await supabaseSelect<MonthlyMessageRow>('wati_messages', 'direction=eq.INBOUND&select=received_at&order=received_at.asc&limit=5000');
  const byMonth = new Map<string, number>();
  for (const row of rows) { const month = row.received_at.slice(0, 7); byMonth.set(month, (byMonth.get(month) || 0) + 1); }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => ({ period, value }));
}

const forecastParams = z.object({
  metricId: z.enum(['sales_order_value', 'sales_order_count', 'inquiry_count']),
  horizon: z.number().min(1).max(12).default(3),
  method: z.enum(['MOVING_AVERAGE', 'EXPONENTIAL_SMOOTHING', 'LINEAR_TREND']).default('MOVING_AVERAGE'),
});

export const forecastMetricTool = tool<typeof forecastParams, JarvisRunContext>({
  name: 'forecast_metric',
  description: 'Forecast Sales Order value, Sales Order count, or inbound inquiry count for the next N months using a transparent method (moving average / exponential smoothing / linear trend). Returns INSUFFICIENT_DATA rather than a fabricated number when history is too short. Never presented as certainty — always includes an uncertainty band.',
  parameters: forecastParams,
  async execute({ metricId, horizon, method }, context) {
    const series = await cached(context, `bi:series:${metricId}`, () =>
      metricId === 'sales_order_value' ? monthlySalesOrderSeries()
        : metricId === 'sales_order_count' ? monthlyOrderCountSeries()
        : monthlyInquirySeries());
    const result = forecastSeries(series, horizon, method as ForecastMethod, metricId);
    emit(result.status === 'OK' ? 'forecast.generated' : 'forecast.insufficient_data', metricId);
    return { source: 'VIA-tracked commercial_drafts / wati_messages, bucketed by calendar month', trainingSeries: series, ...result };
  },
});

// ── 9. Scenario engine ────────────────────────────────────────────────────────

const scenarioParams = z.object({
  scenarioType: z.enum(['QUOTATION_CONVERSION', 'AVERAGE_ORDER_VALUE', 'GENERIC']),
  quotationCount: z.number().min(0).nullable(),
  currentConversionRate: z.number().min(0).max(1).nullable(),
  targetConversionRate: z.number().min(0).max(1).nullable(),
  averageOrderValue: z.number().min(0).nullable(),
  currentAverageOrderValue: z.number().min(0).nullable(),
  percentIncrease: z.number().nullable(),
  orderCount: z.number().min(0).nullable(),
  genericMetricId: z.string().nullable(),
  genericMetricLabel: z.string().nullable(),
  genericBaselineValue: z.number().nullable(),
  genericAssumptionLabel: z.string().nullable(),
  genericAssumptionType: z.enum(['ABSOLUTE', 'PERCENT']).nullable(),
  genericAssumptionDelta: z.number().nullable(),
});

export const runBusinessScenarioTool = tool<typeof scenarioParams, JarvisRunContext>({
  name: 'run_business_scenario',
  description: 'Run a deterministic, non-executing "what if" scenario (e.g. quotation conversion rate change, average order value change, or a generic metric assumption). This is NEVER a forecast — it applies arithmetic to a management-supplied assumption, not history-based extrapolation.',
  parameters: scenarioParams,
  async execute(input) {
    if (input.scenarioType === 'QUOTATION_CONVERSION') {
      if (input.quotationCount == null || input.currentConversionRate == null || input.targetConversionRate == null || input.averageOrderValue == null) {
        throw new Error('quotationCount, currentConversionRate, targetConversionRate, and averageOrderValue are all required for a QUOTATION_CONVERSION scenario.');
      }
      const result = scenarioQuotationConversionChange({ quotationCount: input.quotationCount, currentConversionRate: input.currentConversionRate, targetConversionRate: input.targetConversionRate, averageOrderValue: input.averageOrderValue });
      emit('scenario.executed', 'quotation_conversion');
      return result;
    }
    if (input.scenarioType === 'AVERAGE_ORDER_VALUE') {
      if (input.currentAverageOrderValue == null || input.percentIncrease == null || input.orderCount == null) {
        throw new Error('currentAverageOrderValue, percentIncrease, and orderCount are all required for an AVERAGE_ORDER_VALUE scenario.');
      }
      const result = scenarioAverageOrderValueChange({ currentAverageOrderValue: input.currentAverageOrderValue, percentIncrease: input.percentIncrease, orderCount: input.orderCount });
      emit('scenario.executed', 'average_order_value');
      return result;
    }
    if (input.genericMetricId == null || input.genericMetricLabel == null || input.genericBaselineValue == null || input.genericAssumptionLabel == null || input.genericAssumptionType == null || input.genericAssumptionDelta == null) {
      throw new Error('A GENERIC scenario requires genericMetricId, genericMetricLabel, genericBaselineValue, genericAssumptionLabel, genericAssumptionType, and genericAssumptionDelta.');
    }
    const result = runScenario({ metricId: input.genericMetricId, metricLabel: input.genericMetricLabel, baselineValue: input.genericBaselineValue, assumptionLabel: input.genericAssumptionLabel, assumptionType: input.genericAssumptionType, assumptionDelta: input.genericAssumptionDelta });
    emit('scenario.executed', input.genericMetricId);
    return result;
  },
});

// ── 10. Decision brief (FACTS/DIAGNOSIS/OPTIONS/TRADE-OFFS/RECOMMENDATION) ────

const decisionBriefParams = z.object({
  current: z.object({ label: z.string(), from: date, to: date }),
  comparison: z.object({ label: z.string(), from: date, to: date }),
  dimension: z.enum(['customer', 'salesperson']),
});

export const getDecisionBriefTool = tool<typeof decisionBriefParams, JarvisRunContext>({
  name: 'get_decision_brief',
  description: 'Build a structured management decision brief (FACTS, DIAGNOSIS, OPTIONS with trade-offs, RECOMMENDATION, CONFIDENCE, DATA LIMITATIONS) for a sales revenue change between two explicit Zoho issued-invoice periods, decomposed by customer or salesperson. Never claims causation — only where the change is concentrated.',
  parameters: decisionBriefParams,
  async execute({ current, comparison, dimension }, context) {
    const [currentInvoices, comparisonInvoices] = await Promise.all([
      cached(context, `bi:invoices:${current.from}:${current.to}`, () => fetchInvoices(current.from, current.to)),
      cached(context, `bi:invoices:${comparison.from}:${comparison.to}`, () => fetchInvoices(comparison.from, comparison.to)),
    ]);
    const currentObs = observations(currentInvoices), comparisonObs = observations(comparisonInvoices);
    const currentRevenue = currentObs.reduce((s, o) => s + o.revenue, 0), comparisonRevenue = comparisonObs.reduce((s, o) => s + o.revenue, 0);
    const percentChange = comparisonRevenue === 0 ? null : ((currentRevenue - comparisonRevenue) / comparisonRevenue) * 100;
    const contributions = decomposeSalesChange(currentObs, comparisonObs, dimension);
    const topDriver = contributions[0] ? { dimensionValue: contributions[0].name, current: contributions[0].current, comparison: contributions[0].comparison, change: contributions[0].change, contributionToChange: contributions[0].contribution_to_change } : null;
    const smallSample = currentObs.length < 10 || comparisonObs.length < 10;

    const brief = buildDecisionBrief({
      facts: [
        `Revenue before PPN moved from Rp ${Math.round(comparisonRevenue).toLocaleString('id-ID')} (${comparison.label}) to Rp ${Math.round(currentRevenue).toLocaleString('id-ID')} (${current.label})${percentChange !== null ? `, a ${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}% change` : ''}.`,
        `${currentObs.length} issued invoices in ${current.label} vs ${comparisonObs.length} in ${comparison.label}.`,
      ],
      topDriver, driverDimensionLabel: dimension,
      driverCategory: (dimension === 'salesperson' ? 'SALESPERSON' : 'CUSTOMER') as DriverCategory,
      confidence: smallSample ? 'LOW' : 'HIGH',
      dataLimitations: ['Zoho issued invoices only — draft/void excluded.', smallSample ? 'One or both periods have fewer than 10 invoices; treat this as directional, not conclusive.' : 'Invoice count is adequate for a directional read.'],
    });
    emit('metric.queried', 'decision_brief');
    return { source: 'Zoho Books issued invoices', current, comparison, ...brief, topContributors: contributions.slice(0, 5) };
  },
});

// ── 11. Extended data quality ────────────────────────────────────────────────

const grainParams = z.object({ grain: z.enum(['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'THIS_MONTH', 'LAST_MONTH']) });

export const getExtendedDataQualityTool = tool<typeof grainParams, JarvisRunContext>({
  name: 'get_extended_data_quality_report',
  description: 'Get the extended data-quality report: attribution/customer-mapping coverage, duplicate customer groups, orphan product codes, customers missing a salesperson, open pricing-resolution findings, and sync freshness.',
  parameters: grainParams,
  async execute({ grain }) {
    const report = await getExtendedDataQualityReport(resolveTimeGrain(grain));
    if (report.orphanProductCodes > 0 || report.priceResolutionFailuresOpen > 0 || report.syncFreshness.some(s => s.stale)) emit('data_quality.issue', grain);
    return { kind: 'extended_data_quality_report', ...report };
  },
});

// ── 12-13. Management decisions ──────────────────────────────────────────────

const recordDecisionParams = z.object({
  decision: z.string(), rationale: z.string(),
  linkedFindingType: z.enum(['OPERATIONAL_FINDING', 'PROACTIVE_ACTION', 'OTHER']).nullable(),
  linkedFindingId: z.string().nullable(), linkedFindingDescription: z.string().nullable(),
  expectedOutcome: z.string(), reviewDate: date,
});
const reviewDecisionParams = z.object({ decisionId: z.string(), expectedVersion: z.number(), actualOutcome: z.string() });
const listDecisionsParams = z.object({ status: z.enum(['PENDING_REVIEW', 'REVIEWED']).nullable() });

export const recordManagementDecisionTool = tool<typeof recordDecisionParams, JarvisRunContext>({
  name: 'record_management_decision',
  description: 'Record a management decision made in response to a finding or brief, with its rationale and expected outcome, so the actual outcome can be compared later.',
  parameters: recordDecisionParams,
  async execute(input, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const record = await recordDecision({
      decision: input.decision, rationale: input.rationale,
      linkedFindingType: input.linkedFindingType ?? undefined, linkedFindingId: input.linkedFindingId ?? undefined,
      linkedFindingDescription: input.linkedFindingDescription ?? undefined,
      decidedBy: context.context.role, expectedOutcome: input.expectedOutcome, reviewDate: input.reviewDate,
    });
    emit('decision.recorded', record.id);
    return { kind: 'decision_recorded', decision: record };
  },
});

export const reviewManagementDecisionTool = tool<typeof reviewDecisionParams, JarvisRunContext>({
  name: 'review_management_decision',
  description: 'Record the actual outcome of a previously-made management decision, for comparison against its expected outcome.',
  parameters: reviewDecisionParams,
  async execute({ decisionId, expectedVersion, actualOutcome }, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const record = await reviewDecision(decisionId, context.context.role, expectedVersion, actualOutcome);
    return { kind: 'decision_reviewed', decision: record };
  },
});

export const listManagementDecisionsTool = tool<typeof listDecisionsParams, JarvisRunContext>({
  name: 'list_management_decisions',
  description: 'List recorded management decisions, optionally filtered by review status.',
  parameters: listDecisionsParams,
  async execute({ status }) {
    const decisions = await listDecisions(status ? { status } : {});
    return { kind: 'management_decisions', count: decisions.length, decisions };
  },
});

export const getDecisionByIdTool = tool<z.ZodObject<{ decisionId: z.ZodString }>, JarvisRunContext>({
  name: 'get_decision_detail',
  description: 'Get one management decision record by ID.',
  parameters: z.object({ decisionId: z.string() }),
  async execute({ decisionId }) {
    const decision = await getDecision(decisionId);
    return decision ? { kind: 'decision_detail', decision } : { kind: 'decision_detail', error: 'Decision not found.' };
  },
});

// ── 14-15. Management experiments ────────────────────────────────────────────

const createExperimentParams = z.object({ name: z.string(), hypothesis: z.string(), metricId: z.string(), beforeValue: z.number(), beforeSampleSize: z.number().min(0) });
const recordExperimentResultParams = z.object({ experimentId: z.string(), expectedVersion: z.number(), afterValue: z.number(), afterSampleSize: z.number().min(0), higherIsBetter: z.boolean() });
const listExperimentsParams = z.object({ status: z.enum(['RUNNING', 'INSUFFICIENT_DATA', 'CONCLUDED']).nullable() });

export const createManagementExperimentTool = tool<typeof createExperimentParams, JarvisRunContext>({
  name: 'create_management_experiment',
  description: 'Start a controlled management experiment (e.g. "change quotation follow-up timing"), recording the before value and sample size for a named governed metric.',
  parameters: createExperimentParams,
  async execute(input, context) {
    if (!context?.context) throw new Error('JARVIS run context is unavailable.');
    const experiment = await createExperiment({ ...input, createdBy: context.context.role });
    return { kind: 'experiment_created', experiment };
  },
});

export const recordExperimentResultTool = tool<typeof recordExperimentResultParams, JarvisRunContext>({
  name: 'record_experiment_result',
  description: 'Record the after-value and sample size for a running experiment. Below the minimum sample size on either side, this NEVER declares success or failure — it marks the experiment INSUFFICIENT_DATA instead.',
  parameters: recordExperimentResultParams,
  async execute({ experimentId, expectedVersion, afterValue, afterSampleSize, higherIsBetter }) {
    const experiment = await recordExperimentResult(experimentId, expectedVersion, { afterValue, afterSampleSize, higherIsBetter });
    return { kind: 'experiment_result_recorded', experiment };
  },
});

export const listManagementExperimentsTool = tool<typeof listExperimentsParams, JarvisRunContext>({
  name: 'list_management_experiments',
  description: 'List management experiments, optionally filtered by status.',
  parameters: listExperimentsParams,
  async execute({ status }) {
    const experiments = await listExperiments(status ?? undefined);
    return { kind: 'management_experiments', count: experiments.length, experiments };
  },
});

export const getExperimentByIdTool = tool<z.ZodObject<{ experimentId: z.ZodString }>, JarvisRunContext>({
  name: 'get_experiment_detail',
  description: 'Get one management experiment record by ID.',
  parameters: z.object({ experimentId: z.string() }),
  async execute({ experimentId }) {
    const experiment = await getExperiment(experimentId);
    return experiment ? { kind: 'experiment_detail', experiment } : { kind: 'experiment_detail', error: 'Experiment not found.' };
  },
});

// ── 16. Cash collected ────────────────────────────────────────────────────────

const cashCollectedParams = z.object({ from: date, to: date });

export const getCashCollectedTool = tool<typeof cashCollectedParams, JarvisRunContext>({
  name: 'get_cash_collected',
  description: 'Get actual cash collected (Zoho customer payments received) for a date range — distinct from Invoiced Sales (billed) and Sales Order Value (committed). Never call this "revenue".',
  parameters: cashCollectedParams,
  async execute({ from, to }, context) {
    validatePeriod(from, to);
    const result = await cached(context, `bi:cash-collected:${from}:${to}`, () => getCashCollected(from, to));
    emit('metric.queried', 'cash_collected');
    return { source: 'Zoho Books customer payments', ...result };
  },
});
