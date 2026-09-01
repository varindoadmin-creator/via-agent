// ─── Dormant customer detector ─────────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief section 26: dormancy is judged from
// actual commercial activity, not "no WhatsApp message" — a customer with an
// authoritative assigned salesperson (an established relationship, brief
// section 21) whose last completed commercial_drafts activity is older than
// a configurable window. Always REQUIRES_REVIEW.
//
// Known limitation: this only reads commercial_drafts (VIA-originated deals),
// not full Zoho invoice/Sales Order history — a customer who reorders through
// a channel VIA never sees (phone, walk-in, direct Zoho entry) can look
// falsely dormant here. Scanning full Zoho order history per customer was
// judged too expensive to run on every sweep (see reorderOpportunity.ts's
// same cost note); documented rather than built speculatively.

import { supabaseSelect } from '../../supabase/rest.ts';
import type { ProactiveActionCandidate } from '../types.ts';

function envDays(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface SalespersonMapRow { customer_id: string; customer_name: string }
interface DraftRow { customer_id: string; created_at: string }

export async function detectDormantCustomers(): Promise<ProactiveActionCandidate[]> {
  const dormantDays = envDays('PROACTIVE_DORMANT_CUSTOMER_DAYS', 180);
  const cutoff = new Date(Date.now() - dormantDays * 24 * 60 * 60_000).toISOString();
  const batchLimit = envDays('PROACTIVE_DORMANT_MAX_CUSTOMERS_PER_RUN', 50);

  const managedCustomers = await supabaseSelect<SalespersonMapRow>(
    'customer_salesperson_map', `select=customer_id,customer_name&order=last_seen_at.asc&limit=${batchLimit}`,
  );
  if (managedCustomers.length === 0) return [];

  const customerIds = managedCustomers.map(c => c.customer_id);
  const recentDrafts = await supabaseSelect<DraftRow>(
    'commercial_drafts',
    `customer_id=in.(${customerIds.join(',')})&status=eq.COMPLETED&select=customer_id,created_at&order=created_at.desc`,
  );
  const lastActivity = new Map<string, string>();
  for (const draft of recentDrafts) {
    if (!lastActivity.has(draft.customer_id)) lastActivity.set(draft.customer_id, draft.created_at);
  }

  const candidates: ProactiveActionCandidate[] = [];
  for (const customer of managedCustomers) {
    const last = lastActivity.get(customer.customer_id);
    if (!last) continue; // never purchased through VIA at all — not "dormant", just unestablished; do not guess.
    if (last >= cutoff) continue;

    const daysSince = Math.round((Date.now() - new Date(last).getTime()) / 86_400_000);
    candidates.push({
      type: 'DORMANT_CUSTOMER_REENGAGEMENT',
      customerId: customer.customer_id,
      reason: `${customer.customer_name} has had no completed order through VIA in ${daysSince} days.`,
      evidence: [{ label: 'Days since last VIA order', value: daysSince }, { label: 'Last order date', value: last }],
      recommendedAction: 'Sales should decide whether to re-engage this dormant account.',
      channel: 'WHATSAPP', messageCategory: 'SALES_FOLLOW_UP', assignedTeam: 'SALES', priority: 'LOW',
      dedupeKey: `DORMANT_CUSTOMER_REENGAGEMENT:${customer.customer_id}:${new Date().toISOString().slice(0, 7)}`,
    });
  }
  return candidates;
}
