// ─── Proactive detection engine ───────────────────────────────────────────────
// VIA Customer Operations Phase 11: runs every enabled detector, turns each
// candidate into a persisted, deduplicated ProactiveCustomerAction via the
// approval policy (section 30), then separately auto-sends anything that
// came out AUTO_ALLOWED. Mirrors operationalIntelligence/detectionEngine.ts's
// run/upsert/report shape.

import { upsertAction, listActions, markExpired, markConverted } from './store.ts';
import { approvalLevelForAction } from './approvalPolicy.ts';
import { sendProactiveOutreach } from './sendOutreach.ts';
import { supabaseSelect } from '../supabase/rest.ts';
import type { ProactiveActionCandidate } from './types.ts';
import {
  isQuotationFollowupEnabled, isReorderOpportunitiesEnabled, isSampleFollowupEnabled, isDormantCustomerEnabled,
} from '../customerIdentity/featureFlags.ts';
import { detectQuotationFollowUp } from './detectors/quotationFollowUp.ts';
import { detectOrderIntentFollowUp, detectInactiveCommercialDrafts } from './detectors/orderIntentFollowUp.ts';
import { detectUnprocessedSampleRequests, detectSampleToOrderOpportunity } from './detectors/sampleRequestFollowUp.ts';
import { detectReorderOpportunities } from './detectors/reorderOpportunity.ts';
import { detectDormantCustomers } from './detectors/dormantCustomer.ts';
import { detectServiceRecoveryCandidates } from './detectors/serviceRecovery.ts';

function envHours(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface ProactiveDetectionResult {
  candidatesEvaluated: number;
  newActions: number;
  updatedActions: number;
  skipped: number;
  sent: number;
  expired: number;
  converted: number;
}

async function persistCandidates(candidates: ProactiveActionCandidate[]): Promise<{ newActions: number; updatedActions: number; skipped: number }> {
  let newActions = 0, updatedActions = 0, skipped = 0;
  for (const candidate of candidates) {
    const level = approvalLevelForAction(candidate.type, candidate.channel, candidate.customerId ?? candidate.customerPhoneNormalized ?? undefined);
    if (level === 'PROHIBITED') { skipped++; continue; }
    const initialStatus = level === 'AUTO_ALLOWED' ? 'DETECTED' : 'REVIEW_REQUIRED';
    const { isNew, skipped: wasSkipped } = await upsertAction(candidate, initialStatus, level !== 'AUTO_ALLOWED');
    if (wasSkipped) skipped++;
    else if (isNew) newActions++;
    else updatedActions++;
  }
  return { newActions, updatedActions, skipped };
}

/** Section 19: a follow-up that never got a response after its final stage stops — never an infinite loop. */
async function expireStalePendingActions(): Promise<number> {
  const expiryHours = envHours('PROACTIVE_ACTION_EXPIRY_HOURS', 168);
  const cutoff = new Date(Date.now() - expiryHours * 60 * 60_000).toISOString();
  const rows = await supabaseSelect<{ id: string; version: number }>(
    'proactive_customer_actions',
    `status=eq.SENT&sent_at=lt.${cutoff}&select=id,version&limit=200`,
  );
  let expired = 0;
  for (const row of rows) {
    try { await markExpired(row.id, row.version); expired++; } catch { /* concurrent update — leave for next pass */ }
  }
  return expired;
}

/** Best-effort conversion detection for SENT quotation follow-ups whose draft's customer has since completed a Sales Order. */
async function detectConversions(): Promise<number> {
  const sentQuotationActions = await listActions({ status: ['SENT', 'CUSTOMER_RESPONDED'], type: 'QUOTATION_FOLLOW_UP' });
  let converted = 0;
  for (const action of sentQuotationActions) {
    if (!action.customerId || !action.sentAt) continue;
    const rows = await supabaseSelect<{ id: string }>(
      'commercial_drafts',
      `type=eq.SALES_ORDER&status=eq.COMPLETED&customer_id=eq.${encodeURIComponent(action.customerId)}&created_at=gt.${action.sentAt}&select=id&limit=1`,
    );
    if (rows.length > 0) {
      try { await markConverted(action.id, action.version); converted++; } catch { /* concurrent update */ }
    }
  }
  return converted;
}

export async function runProactiveDetection(options: { autoSend: boolean; includeExpensiveRules: boolean }): Promise<ProactiveDetectionResult> {
  const detectorRuns: Promise<ProactiveActionCandidate[]>[] = [
    isQuotationFollowupEnabled() ? detectQuotationFollowUp() : Promise.resolve([]),
    detectOrderIntentFollowUp(),
    detectInactiveCommercialDrafts(),
    isSampleFollowupEnabled() ? detectUnprocessedSampleRequests() : Promise.resolve([]),
    isSampleFollowupEnabled() ? detectSampleToOrderOpportunity() : Promise.resolve([]),
    detectServiceRecoveryCandidates(),
  ];
  if (options.includeExpensiveRules) {
    if (isReorderOpportunitiesEnabled()) detectorRuns.push(detectReorderOpportunities());
    if (isDormantCustomerEnabled()) detectorRuns.push(detectDormantCustomers());
  }

  const results = await Promise.all(detectorRuns.map(p => p.catch((error) => { console.error('[proactiveActions.detectionEngine] detector failed:', error); return []; })));
  const candidates = results.flat();

  const { newActions, updatedActions, skipped } = await persistCandidates(candidates);

  let sent = 0;
  if (options.autoSend) {
    const sendable = await listActions({ status: ['DETECTED'] });
    for (const action of sendable.filter(a => a.channel === 'WHATSAPP' && !a.requiresApproval)) {
      const outcome = await sendProactiveOutreach(action.id);
      if (outcome.result === 'SENT') sent++;
    }
    const approved = await listActions({ status: ['APPROVED'] });
    for (const action of approved.filter(a => a.channel === 'WHATSAPP')) {
      const outcome = await sendProactiveOutreach(action.id);
      if (outcome.result === 'SENT') sent++;
    }
  }

  const expired = await expireStalePendingActions();
  const converted = await detectConversions();

  return { candidatesEvaluated: candidates.length, newActions, updatedActions, skipped, sent, expired, converted };
}
