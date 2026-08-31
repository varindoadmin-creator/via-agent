// ─── Metric registry ──────────────────────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 38-39: every KPI's formula
// documented once, centrally — dashboards and Jarvis both read the same
// registry (via metricService.ts) so their numbers can never drift apart.

export interface MetricDefinition {
  key: string;
  name: string;
  description: string;
  formulaDescription: string;
  unit: 'COUNT' | 'PERCENT' | 'MINUTES' | 'IDR';
  allowedDimensions: string[];
}

export const METRIC_REGISTRY: readonly MetricDefinition[] = [
  { key: 'inbound_conversations', name: 'Inbound Conversations', description: 'Distinct WhatsApp conversation rows updated in the period.', formulaDescription: 'count(wati_conversation_state rows touched in range)', unit: 'COUNT', allowedDimensions: ['date'] },
  { key: 'auto_resolution_rate', name: 'Auto Resolution Rate', description: 'Share of conversations that never required a human handoff.', formulaDescription: '(inbound_conversations - handoff_count) / inbound_conversations', unit: 'PERCENT', allowedDimensions: ['date'] },
  { key: 'human_handoff_rate', name: 'Human Handoff Rate', description: 'Share of conversations that required a human handoff.', formulaDescription: 'handoff_count / inbound_conversations', unit: 'PERCENT', allowedDimensions: ['date', 'handoff_reason', 'team'] },
  { key: 'human_resolution_rate', name: 'Human Resolution Rate', description: 'Share of handed-off cases that reached RESOLVED.', formulaDescription: 'resolved_handoffs / handoff_count', unit: 'PERCENT', allowedDimensions: ['date', 'team'] },
  { key: 'median_resolution_minutes', name: 'Median Resolution Time', description: 'Median minutes from handoff_created_at to resolved_at.', formulaDescription: 'median(resolved_at - handoff_created_at) over resolved cases', unit: 'MINUTES', allowedDimensions: ['date', 'team'] },
  { key: 'sla_compliance', name: 'SLA Compliance', description: 'Share of handoffs whose SLA status is ON_TIME.', formulaDescription: 'ON_TIME cases / evaluated cases', unit: 'PERCENT', allowedDimensions: ['date', 'team'] },
  { key: 'sla_breach_rate', name: 'SLA Breach Rate', description: 'Share of handoffs whose SLA status is BREACHED.', formulaDescription: 'BREACHED cases / evaluated cases', unit: 'PERCENT', allowedDimensions: ['date', 'team'] },
  { key: 'backlog', name: 'Backlog', description: 'Cases currently open and human-owned (NEEDS_HUMAN/HUMAN_ASSIGNED/HUMAN_ACTIVE), as of now.', formulaDescription: 'count(state in (NEEDS_HUMAN, HUMAN_ASSIGNED, HUMAN_ACTIVE))', unit: 'COUNT', allowedDimensions: ['team'] },
  { key: 'stock_inquiry_count', name: 'Stock Inquiry Count', description: 'Stock inquiries created in the period.', formulaDescription: 'count(stock_inquiries created in range)', unit: 'COUNT', allowedDimensions: ['date', 'vendor'] },
  { key: 'vendor_median_response_minutes', name: 'Vendor Median Response Time', description: 'Median minutes from inquiry creation to closure, per vendor.', formulaDescription: 'median(closed_at - created_at) grouped by primary_source', unit: 'MINUTES', allowedDimensions: ['date', 'vendor'] },
  { key: 'vendor_oos_rate', name: 'Vendor OOS Rate', description: 'Share of a vendor\'s stock inquiries resolved as OUT_OF_STOCK.', formulaDescription: 'OUT_OF_STOCK inquiries / vendor inquiries', unit: 'PERCENT', allowedDimensions: ['date', 'vendor'] },
  { key: 'commercial_drafts_created', name: 'Commercial Drafts Created', description: 'Order/quotation drafts created in the period.', formulaDescription: 'count(commercial_drafts created in range)', unit: 'COUNT', allowedDimensions: ['date', 'type'] },
  { key: 'draft_to_order_conversion', name: 'Draft-to-Order Conversion', description: 'Share of non-draft, non-cancelled commercial drafts that reached an executed Sales Order.', formulaDescription: 'executed SO drafts / (drafts where status not in (DRAFT, CANCELLED))', unit: 'PERCENT', allowedDimensions: ['date'] },
  { key: 'sales_order_value', name: 'Sales Order Value', description: 'Sum of approved-price totals for executed Sales Orders (Zoho-authoritative, never a WhatsApp-quoted figure).', formulaDescription: 'sum(commercial_drafts.total where type=SALES_ORDER and zoho_object_id is not null)', unit: 'IDR', allowedDimensions: ['date', 'source'] },
  { key: 'onboarding_completion_rate', name: 'Onboarding Completion Rate', description: 'Share of onboarding drafts that reached CUSTOMER_CREATED.', formulaDescription: 'CUSTOMER_CREATED drafts / onboarding drafts started', unit: 'PERCENT', allowedDimensions: ['date'] },
  { key: 'attribution_coverage', name: 'Attribution Coverage', description: 'Share of inbound messages with a confirmed (non-UNKNOWN) source.', formulaDescription: 'messages with source != UNKNOWN / inbound messages', unit: 'PERCENT', allowedDimensions: ['date'] },
] as const;

export function getMetricDefinition(key: string): MetricDefinition | undefined {
  return METRIC_REGISTRY.find(m => m.key === key);
}
