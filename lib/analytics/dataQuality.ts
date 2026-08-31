// ─── Analytics data-quality coverage ─────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 62-63: a narrow sibling to
// the existing lib/dataQuality/ module (a different domain — master-data
// duplicate hygiene). This checks attribution/linkage coverage specific to
// the customer-operations funnel this phase reports on.

import { supabaseSelect } from '../supabase/rest.ts';
import type { DateRange } from './periods.ts';

interface MessageRow { source: string | null }
interface DraftRow { customer_id: string | null; zoho_object_id: string | null; status: string }

function safeRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export interface DataQualityCoverage {
  attributionCoverage: number | null; // fraction of inbound messages with a non-UNKNOWN source
  customerMappingCoverage: number | null; // fraction of executed commercial drafts with a resolved customerId
  orderLinkageCoverage: number | null; // fraction of executed sales-order drafts that carry a zoho_object_id
}

export async function getDataQualityCoverage(range: DateRange): Promise<DataQualityCoverage> {
  const [messages, drafts] = await Promise.all([
    supabaseSelect<MessageRow>('wati_messages', `received_at=gte.${range.start.toISOString()}&received_at=lt.${range.end.toISOString()}&direction=eq.INBOUND&select=source`),
    supabaseSelect<DraftRow>('commercial_drafts', `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&select=customer_id,zoho_object_id,status`),
  ]);

  const attributed = messages.filter(m => m.source && m.source !== 'UNKNOWN');
  const executedDrafts = drafts.filter(d => d.status === 'COMPLETED');

  return {
    attributionCoverage: safeRate(attributed.length, messages.length),
    customerMappingCoverage: safeRate(drafts.filter(d => d.customer_id).length, drafts.length),
    orderLinkageCoverage: safeRate(executedDrafts.filter(d => d.zoho_object_id).length, executedDrafts.length),
  };
}
