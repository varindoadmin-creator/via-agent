// ─── Service reliability tiers ────────────────────────────────────────────────
// VIA Phase 13, brief section 3: a plain, deterministic classification of
// business functions by how much a failure there actually costs the business.
// This is documentation-as-code — it does not itself change runtime
// behavior, but `docs/reliability.md`'s failure-model table and the jobs
// sweep's alert severity (lib/jobs/queue.ts's job-type-to-tier mapping) both
// read this file rather than re-deciding tiers ad hoc.

export type ServiceTier = 'CRITICAL' | 'IMPORTANT' | 'NON_CRITICAL';

export interface ServiceFunctionTier {
  tier: ServiceTier;
  rationale: string;
}

export const SERVICE_FUNCTION_TIERS: Record<string, ServiceFunctionTier> = {
  inbound_wati_ingestion: {
    tier: 'CRITICAL',
    rationale: 'A lost inbound message is a lost customer inquiry — no other channel captures it.',
  },
  customer_identity_resolution: {
    tier: 'CRITICAL',
    rationale: 'A wrong customer match risks cross-customer data disclosure or pricing applied to the wrong account.',
  },
  pricing_resolution: {
    tier: 'CRITICAL',
    rationale: 'A wrong or stale price is a direct financial and trust exposure.',
  },
  order_quotation_approval_write: {
    tier: 'CRITICAL',
    rationale: 'Creates a real Zoho Estimate/Sales Order — a duplicate or wrong-customer write has direct financial consequences.',
  },
  payment_status_lookup: {
    tier: 'CRITICAL',
    rationale: 'A wrong payment claim (e.g. "paid" when it is not) can cause a customer to under-deliver or Varindo to ship unpaid.',
  },
  stock_workflow_persistence: {
    tier: 'CRITICAL',
    rationale: 'Losing a stock-inquiry record breaks the vendor-first workflow and the SLA/waiting-state derivation every later phase depends on.',
  },
  proactive_customer_analytics: {
    tier: 'IMPORTANT',
    rationale: 'Dashboards and Jarvis analytics inform decisions but do not themselves create a business consequence if briefly stale or unavailable.',
  },
  proactive_findings_and_actions: {
    tier: 'IMPORTANT',
    rationale: 'A missed proactive follow-up or finding is a lost opportunity or a delayed catch, not an active harm — it degrades gracefully by simply not firing.',
  },
  sample_catalogue_workflow: {
    tier: 'IMPORTANT',
    rationale: 'A delayed sample/catalogue request inconveniences a customer but does not corrupt any financial or identity record.',
  },
  management_summaries_bi_narration: {
    tier: 'NON_CRITICAL',
    rationale: 'A stale or unavailable BI narrative is inconvenient, never harmful — the underlying governed metrics remain intact.',
  },
  optional_enrichment: {
    tier: 'NON_CRITICAL',
    rationale: 'Product/brand enrichment, salesperson-map learning, and similar best-effort background enrichment can fail silently without customer or financial impact.',
  },
};

export function tierOf(functionName: string): ServiceTier {
  return SERVICE_FUNCTION_TIERS[functionName]?.tier ?? 'NON_CRITICAL';
}

/** IMPORTANT/NON_CRITICAL failures should never trigger the same alert urgency as a CRITICAL one — see lib/jobs/queue.ts's JOB_TYPE_TIER. */
export function isCriticalTier(functionName: string): boolean {
  return tierOf(functionName) === 'CRITICAL';
}
