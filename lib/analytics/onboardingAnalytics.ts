// ─── New customer / onboarding funnel ────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 21-22, 67-68: reads Phase
// 6's customer_channel_identities/customer_drafts directly. "New Customer"
// is defined per brief section 67 as a Zoho customer successfully created
// through onboarding — never every unknown WhatsApp number.

import { supabaseSelect } from '../supabase/rest.ts';
import type { DateRange } from './periods.ts';

interface CustomerDraftRow {
  id: string; status: string; created_at: string; updated_at: string;
  duplicate_check_status: string | null;
}
interface ChannelIdentityRow { id: string; source: string; relationship_status: string; created_at: string }

function safeRate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface OnboardingFunnelResult {
  onboardingStarted: number;
  onboardingCompleted: number;
  onboardingAbandoned: number;
  duplicateDetected: number;
  completionRate: number | null;
  medianOnboardingMinutes: number;
  existingZohoMatchCount: number;
  newCustomersCreated: number;
}

const TERMINAL_INCOMPLETE = new Set(['FAILED', 'CANCELLED']);

export async function getOnboardingFunnel(range: DateRange): Promise<OnboardingFunnelResult> {
  const [drafts, mappings] = await Promise.all([
    supabaseSelect<CustomerDraftRow>('customer_drafts', `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&select=id,status,created_at,updated_at,duplicate_check_status`),
    supabaseSelect<ChannelIdentityRow>('customer_channel_identities', `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&select=id,source,relationship_status,created_at`),
  ]);

  const completed = drafts.filter(d => d.status === 'CUSTOMER_CREATED');
  const abandoned = drafts.filter(d => TERMINAL_INCOMPLETE.has(d.status));
  const durations = completed.map(d => (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 60_000);

  return {
    onboardingStarted: drafts.length,
    onboardingCompleted: completed.length,
    onboardingAbandoned: abandoned.length,
    duplicateDetected: drafts.filter(d => d.duplicate_check_status === 'LIKELY_DUPLICATE' || d.duplicate_check_status === 'AMBIGUOUS').length,
    completionRate: safeRate(completed.length, drafts.length),
    medianOnboardingMinutes: median(durations),
    existingZohoMatchCount: mappings.filter(m => m.source === 'ZOHO_CONTACT_MATCH').length,
    newCustomersCreated: mappings.filter(m => m.source === 'ONBOARDING_CREATED').length,
  };
}

export interface IdentityFrictionResult {
  singleCustomerAutoResolutionRate: number | null;
  unmatchedCustomerRate: number | null;
}

/** Brief section 22 — identifies whether customer/contact mapping needs cleanup. */
export async function getIdentityFriction(range: DateRange): Promise<IdentityFrictionResult> {
  const mappings = await supabaseSelect<{ normalized_phone: string }>(
    'customer_channel_identities',
    `created_at=gte.${range.start.toISOString()}&created_at=lt.${range.end.toISOString()}&relationship_status=neq.DISABLED&select=normalized_phone`,
  );
  const byPhone = new Map<string, number>();
  for (const m of mappings) byPhone.set(m.normalized_phone, (byPhone.get(m.normalized_phone) ?? 0) + 1);
  const phones = Array.from(byPhone.values());
  const singleCustomerPhones = phones.filter(count => count === 1).length;

  return {
    singleCustomerAutoResolutionRate: safeRate(singleCustomerPhones, phones.length),
    unmatchedCustomerRate: null, // Requires a denominator of ALL inbound phones, computed by getCustomerServiceFunnel — combined by the metric service, not duplicated here.
  };
}
