// ─── Reorder opportunity detector ─────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief sections 9-10: a reorder candidate
// requires real historical evidence (>= 3 prior orders of the same canonical
// Zoho item, brief section 10 — never text-similarity), and never fires for
// an item that is now inactive in Zoho. Always REQUIRES_REVIEW regardless of
// feature flags (approvalPolicy.ts) — the brief is explicit that reorder
// outreach needs validated policy before any auto-send, not just a flag flip.
//
// Cost note: this detector makes one Zoho call per candidate order to read
// line items (no list endpoint exposes them — see lib/zoho/purchaseHistory.ts).
// Deliberately scoped to a small, rotating batch of customers per run so it
// never competes for VIA's shared Zoho rate limit the way the cheap,
// Supabase-only detectors do (see the cron sweep's daily-cadence gating).

import { supabaseSelect } from '../../supabase/rest.ts';
import { getCustomerItemPurchaseCadence } from '../../zoho/purchaseHistory.ts';
import { getItemDetail } from '../../zoho/items.ts';
import type { ProactiveActionCandidate } from '../types.ts';

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface SalespersonMapRow { customer_id: string; customer_name: string; last_seen_at: string }

/** Reorder-eligible population = customers with an authoritative assigned-salesperson mapping (brief section 21), staleness-first so a small per-run batch still cycles through everyone over time. */
async function getReorderCandidateCustomers(limit: number): Promise<SalespersonMapRow[]> {
  const rows = await supabaseSelect<SalespersonMapRow>(
    'customer_salesperson_map',
    `select=customer_id,customer_name,last_seen_at&order=last_seen_at.asc&limit=${limit}`,
  );
  const seen = new Set<string>();
  return rows.filter(r => (seen.has(r.customer_id) ? false : (seen.add(r.customer_id), true)));
}

export async function detectReorderOpportunities(): Promise<ProactiveActionCandidate[]> {
  const maxCustomersPerRun = envNumber('PROACTIVE_REORDER_MAX_CUSTOMERS_PER_RUN', 10);
  const reorderMultiplier = envNumber('PROACTIVE_REORDER_GAP_MULTIPLIER', 1.15); // days-since-last must exceed avg gap by this much before flagging

  const customers = await getReorderCandidateCustomers(maxCustomersPerRun);
  const candidates: ProactiveActionCandidate[] = [];

  for (const customer of customers) {
    let cadences;
    try {
      cadences = await getCustomerItemPurchaseCadence(customer.customer_id);
    } catch {
      continue; // Zoho unavailable for this customer this run — skip, never guess.
    }

    for (const cadence of cadences) {
      if (cadence.daysSinceLastPurchase < cadence.averageGapDays * reorderMultiplier) continue;

      const item = await getItemDetail(cadence.itemId).catch(() => null);
      if (!item || item.status !== 'active') continue; // section 10: never offer an inactive item automatically

      candidates.push({
        type: 'REORDER_OPPORTUNITY',
        customerId: customer.customer_id, productId: cadence.itemId,
        reason: `${customer.customer_name} typically reorders ${item.name} every ~${Math.round(cadence.averageGapDays)} days; last purchase was ${Math.round(cadence.daysSinceLastPurchase)} days ago.`,
        evidence: [
          { label: 'Prior orders', value: cadence.orderCount },
          { label: 'Average reorder gap (days)', value: Math.round(cadence.averageGapDays) },
          { label: 'Days since last purchase', value: Math.round(cadence.daysSinceLastPurchase) },
        ],
        recommendedAction: 'Sales should confirm current price/availability and reach out about a reorder.',
        channel: 'WHATSAPP', messageCategory: 'SALES_FOLLOW_UP', assignedTeam: 'SALES', priority: 'LOW',
        dedupeKey: `REORDER_OPPORTUNITY:${customer.customer_id}:${cadence.itemId}:${new Date().toISOString().slice(0, 7)}`,
      });
    }
  }
  return candidates;
}
