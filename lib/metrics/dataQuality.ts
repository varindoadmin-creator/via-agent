// ─── Extended data quality (Phase 12) ─────────────────────────────────────────
// VIA Phase 12, brief section 41. Reuses every existing check rather than
// re-implementing: Phase 9's `getDataQualityCoverage` (attribution/customer-
// mapping/order-linkage), the persisted duplicate-scan snapshot (never a
// live re-scan — that call fans out to every Zoho customer and is already
// reserved for its own long-running cron per CRON_SCHEDULE.md), Phase 10's
// `PRICING_COVERAGE_GAP`/`PRICING_SOURCE_CONFLICT` findings for price
// resolution failures, and `cron_run_log` for sync freshness. Only "orphan
// product codes" and "missing salesperson" are new, narrow, Supabase-only
// checks.

import { supabaseSelect } from '../supabase/rest.ts';
import { getDataQualityCoverage, type DataQualityCoverage } from '../analytics/dataQuality.ts';
import { getLatestDuplicateScan } from '../customerDuplicates/snapshotStore.ts';
import type { DateRange } from '../analytics/periods.ts';

function envHours(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface SyncFreshness {
  jobName: string;
  lastSuccessAt: string | null;
  hoursSinceLastSuccess: number | null;
  stale: boolean;
}

async function checkSyncFreshness(jobName: string, staleAfterHours: number): Promise<SyncFreshness> {
  const rows = await supabaseSelect<{ finished_at: string }>(
    'cron_run_log', `job_name=eq.${encodeURIComponent(jobName)}&status=eq.success&select=finished_at&order=finished_at.desc&limit=1`,
  );
  const lastSuccessAt = rows[0]?.finished_at ?? null;
  const hoursSince = lastSuccessAt ? (Date.now() - new Date(lastSuccessAt).getTime()) / (60 * 60_000) : null;
  return { jobName, lastSuccessAt, hoursSinceLastSuccess: hoursSince, stale: hoursSince === null || hoursSince > staleAfterHours };
}

interface OrphanCodeRow { id: string }
async function countOrphanProductCodes(range: DateRange): Promise<number> {
  const rows = await supabaseSelect<OrphanCodeRow>(
    'wati_messages',
    `received_at=gte.${range.start.toISOString()}&received_at=lt.${range.end.toISOString()}&item_code=not.is.null&item_id=is.null&select=id&limit=500`,
  );
  return rows.length;
}

interface DraftCustomerRow { customer_id: string | null }
interface SalespersonRow { customer_id: string }
async function countCustomersMissingSalesperson(range: DateRange): Promise<{ activeCustomers: number; missingSalesperson: number }> {
  const drafts = await supabaseSelect<DraftCustomerRow>(
    'commercial_drafts',
    `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&customer_id=not.is.null&select=customer_id`,
  );
  const activeCustomerIds = [...new Set(drafts.map(d => d.customer_id).filter((id): id is string => Boolean(id)))];
  if (activeCustomerIds.length === 0) return { activeCustomers: 0, missingSalesperson: 0 };
  const mapped = await supabaseSelect<SalespersonRow>(
    'customer_salesperson_map', `customer_id=in.(${activeCustomerIds.join(',')})&select=customer_id`,
  );
  const mappedSet = new Set(mapped.map(m => m.customer_id));
  return { activeCustomers: activeCustomerIds.length, missingSalesperson: activeCustomerIds.filter(id => !mappedSet.has(id)).length };
}

interface FindingCountRow { id: string }
async function countOpenPricingFindings(): Promise<number> {
  const rows = await supabaseSelect<FindingCountRow>(
    'operational_findings', `type=in.(PRICING_COVERAGE_GAP,PRICING_SOURCE_CONFLICT)&status=eq.OPEN&select=id&limit=500`,
  );
  return rows.length;
}

export interface ExtendedDataQualityReport {
  range: DateRange;
  fromPhase9: DataQualityCoverage;
  duplicateCustomerGroups: { count: number | null; snapshotComputedAt: string | null };
  orphanProductCodes: number;
  customersMissingSalesperson: { activeCustomers: number; missingSalesperson: number };
  priceResolutionFailuresOpen: number;
  syncFreshness: SyncFreshness[];
  computedAt: string;
}

/** One consolidated report — every field traces to an existing table/store; nothing here is invented or LLM-estimated. */
export async function getExtendedDataQualityReport(range: DateRange): Promise<ExtendedDataQualityReport> {
  const [coverage, duplicateScan, orphanCodes, salespersonGap, pricingFailures, salespersonSync, priceListSync] = await Promise.all([
    getDataQualityCoverage(range),
    getLatestDuplicateScan().catch(() => null),
    countOrphanProductCodes(range),
    countCustomersMissingSalesperson(range),
    countOpenPricingFindings(),
    checkSyncFreshness('salesperson-map-sync', envHours('BI_STALE_SALESPERSON_SYNC_HOURS', 48)),
    checkSyncFreshness('inventory-price-list-sync', envHours('BI_STALE_PRICE_SYNC_HOURS', 48)),
  ]);

  return {
    range,
    fromPhase9: coverage,
    duplicateCustomerGroups: {
      count: duplicateScan?.group_count ?? null,
      snapshotComputedAt: duplicateScan?.scanned_at ?? null,
    },
    orphanProductCodes: orphanCodes,
    customersMissingSalesperson: salespersonGap,
    priceResolutionFailuresOpen: pricingFailures,
    syncFreshness: [salespersonSync, priceListSync],
    computedAt: new Date().toISOString(),
  };
}
