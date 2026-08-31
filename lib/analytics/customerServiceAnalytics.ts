// ─── Customer service funnel & KPIs ──────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 9, 14: reads directly from
// Phase 8's wati_conversation_state/customer_service_audit_log — the
// canonical source for handoff/resolution/SLA facts.

import { supabaseSelect } from '../supabase/rest.ts';
import { computeCaseSlaStatus } from '../customerService/sla.ts';
import type { DateRange } from './periods.ts';

interface ConversationRow {
  customer_phone_normalized: string; state: string; handoff_created_at: string | null;
  resolved_at: string | null; handoff_reason: string | null; assigned_team: string | null; updated_at: string;
}

function safeRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface CustomerServiceFunnelResult {
  inboundConversations: number;
  handoffCount: number;
  humanResolvedCount: number;
  autoResolutionRate: number | null;
  humanHandoffRate: number | null;
  humanResolutionRate: number | null;
  medianResolutionMinutes: number;
  averageResolutionMinutes: number;
  slaCompliance: number | null;
  slaBreachRate: number | null;
  backlog: number;
}

export async function getCustomerServiceFunnel(range: DateRange): Promise<CustomerServiceFunnelResult> {
  const conversations = await supabaseSelect<ConversationRow>(
    'wati_conversation_state',
    `updated_at=gte.${range.start.toISOString()}&updated_at=lt.${range.end.toISOString()}&select=customer_phone_normalized,state,handoff_created_at,resolved_at,handoff_reason,assigned_team,updated_at`,
  );

  const handoffs = conversations.filter(c => c.handoff_created_at);
  const resolved = handoffs.filter(c => c.resolved_at);
  const resolutionMinutes = resolved.map(c => (new Date(c.resolved_at as string).getTime() - new Date(c.handoff_created_at as string).getTime()) / 60_000);

  const slaEvaluable = handoffs.filter(c => c.handoff_created_at);
  const slaResults = slaEvaluable.map(c => {
    const referenceTime = c.resolved_at ? new Date(c.resolved_at) : new Date();
    return computeCaseSlaStatus(new Date(c.handoff_created_at as string), referenceTime);
  });

  // Auto resolution: conversations with no handoff at all in this window (never left AUTO).
  const autoResolved = conversations.length - handoffs.length;

  const backlogSnapshot = await supabaseSelect<{ customer_phone_normalized: string }>(
    'wati_conversation_state',
    'state=in.(NEEDS_HUMAN,HUMAN_ASSIGNED,HUMAN_ACTIVE)&select=customer_phone_normalized',
  ).catch(() => []);

  return {
    inboundConversations: conversations.length,
    handoffCount: handoffs.length,
    humanResolvedCount: resolved.length,
    autoResolutionRate: safeRate(autoResolved, conversations.length),
    humanHandoffRate: safeRate(handoffs.length, conversations.length),
    humanResolutionRate: safeRate(resolved.length, handoffs.length),
    medianResolutionMinutes: median(resolutionMinutes),
    averageResolutionMinutes: resolutionMinutes.length ? resolutionMinutes.reduce((a, b) => a + b, 0) / resolutionMinutes.length : 0,
    slaCompliance: safeRate(slaResults.filter(s => s === 'ON_TIME').length, slaResults.length),
    slaBreachRate: safeRate(slaResults.filter(s => s === 'BREACHED').length, slaResults.length),
    backlog: backlogSnapshot.length,
  };
}

export interface HandoffReasonBreakdown { reason: string; count: number }

export async function getHandoffReasonBreakdown(range: DateRange): Promise<HandoffReasonBreakdown[]> {
  const conversations = await supabaseSelect<ConversationRow>(
    'wati_conversation_state',
    `handoff_created_at=gte.${range.start.toISOString()}&handoff_created_at=lt.${range.end.toISOString()}&handoff_reason=not.is.null&select=handoff_reason`,
  );
  const counts = new Map<string, number>();
  for (const c of conversations) {
    const reason = c.handoff_reason as string;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}
