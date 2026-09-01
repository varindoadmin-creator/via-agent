// ─── Sample / catalogue follow-up detector ────────────────────────────────────
// VIA Customer Operations Phase 11, brief section 8: sample submission alone
// never justifies repeated sales outreach. Two distinct paths only:
//   1. a request VIA/Operations has not even processed yet -> internal task.
//   2. a completed sample request for a phone that resolves to exactly one
//      known Zoho customer, with no commercial draft created since -> one
//      Sales follow-up recommendation (REQUIRES_REVIEW; never auto-sent).
// `public.requests` has no completion timestamp separate from created_at
// (per the Phase 11 audit) — created_at is the only time reference available
// for both paths; documented as a known limitation.

import { supabaseSelect } from '../../supabase/rest.ts';
import { resolveCustomerIdentities } from '../../customerIdentity/channelIdentity.ts';
import { normalizePhoneKey } from '../../customers/phoneKey.ts';
import type { ProactiveActionCandidate } from '../types.ts';

function envHours(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

interface RequestRow {
  id: string; request_type: string; status: string; customer_name: string | null;
  phone: string; item_code: string | null; created_at: string;
}

export async function detectUnprocessedSampleRequests(): Promise<ProactiveActionCandidate[]> {
  const windowHours = envHours('PROACTIVE_SAMPLE_UNPROCESSED_HOURS', 24);
  const cutoff = new Date(Date.now() - windowHours * 60 * 60_000).toISOString();

  const rows = await supabaseSelect<RequestRow>(
    'requests',
    `request_type=in.(sample,catalogue)&status=eq.new&created_at=lt.${cutoff}&select=id,request_type,status,customer_name,phone,item_code,created_at&order=created_at.asc&limit=100`,
  );

  return rows.map((request): ProactiveActionCandidate => ({
    type: 'SAMPLE_REQUEST_FOLLOW_UP',
    sampleRequestId: request.id,
    reason: `${request.request_type} request from ${request.customer_name ?? request.phone} has not been processed in ${windowHours}h.`,
    evidence: [{ label: 'Request type', value: request.request_type }, { label: 'Created', value: request.created_at }],
    recommendedAction: 'Operations should process this pending request.',
    channel: 'INTERNAL_TASK', assignedTeam: 'OPERATIONS', priority: 'NORMAL',
    dedupeKey: `SAMPLE_REQUEST_FOLLOW_UP:unprocessed:${request.id}`,
  }));
}

async function hasCommercialDraftSince(customerId: string, sinceIso: string): Promise<boolean> {
  const rows = await supabaseSelect<{ id: string }>(
    'commercial_drafts',
    `customer_id=eq.${encodeURIComponent(customerId)}&created_at=gt.${sinceIso}&select=id&limit=1`,
  );
  return rows.length > 0;
}

export async function detectSampleToOrderOpportunity(): Promise<ProactiveActionCandidate[]> {
  const minAgeHours = envHours('PROACTIVE_SAMPLE_COMPLETED_MIN_HOURS', 72);
  const maxAgeHours = envHours('PROACTIVE_SAMPLE_COMPLETED_MAX_HOURS', 24 * 21);
  const minCutoff = new Date(Date.now() - minAgeHours * 60 * 60_000).toISOString();
  const maxCutoff = new Date(Date.now() - maxAgeHours * 60 * 60_000).toISOString();

  const rows = await supabaseSelect<RequestRow>(
    'requests',
    `request_type=eq.sample&status=eq.completed&created_at=lt.${minCutoff}&created_at=gt.${maxCutoff}&select=id,request_type,status,customer_name,phone,item_code,created_at&order=created_at.desc&limit=100`,
  );

  const candidates: ProactiveActionCandidate[] = [];
  for (const request of rows) {
    const normalizedPhone = normalizePhoneKey(request.phone);
    if (!normalizedPhone) continue;
    const resolution = await resolveCustomerIdentities(normalizedPhone);
    if (resolution.status !== 'ONE') continue; // never guess when a phone maps to more than one customer, or none
    const customerId = resolution.mapping.customer_id;
    if (await hasCommercialDraftSince(customerId, request.created_at)) continue; // already progressed commercially

    candidates.push({
      type: 'SAMPLE_REQUEST_FOLLOW_UP',
      customerId, sampleRequestId: request.id, productId: request.item_code ?? undefined,
      reason: `Completed sample request for ${request.customer_name ?? request.phone} has had no follow-up order.`,
      evidence: [{ label: 'Item', value: request.item_code ?? 'unspecified' }, { label: 'Sample requested', value: request.created_at }],
      recommendedAction: 'Sales should follow up to see if the sample led to commercial interest.',
      channel: 'WHATSAPP', messageCategory: 'SALES_FOLLOW_UP', assignedTeam: 'SALES', priority: 'NORMAL',
      dedupeKey: `SAMPLE_REQUEST_FOLLOW_UP:conversion:${request.id}`,
    });
  }
  return candidates;
}
