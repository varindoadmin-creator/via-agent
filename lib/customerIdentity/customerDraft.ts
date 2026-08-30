// ─── CustomerDraft store ─────────────────────────────────────────────────────
// Brief section 9: a durable onboarding draft. Pure Supabase CRUD — the
// conversational question flow lives in onboarding.ts, duplicate detection in
// duplicateCheck.ts, and the actual Zoho write only ever happens via
// lib/commercialApprovals/executeCustomerCreation.ts after explicit approval.

import { supabaseSelect, supabaseInsert, supabasePatch } from '../supabase/rest.ts';

const TABLE = 'customer_drafts';

export type CustomerDraftStatus =
  | 'COLLECTING_COMPANY' | 'COLLECTING_TAX_REQUIREMENT' | 'COLLECTING_NPWP'
  | 'COLLECTING_BILLING_ADDRESS' | 'COLLECTING_SHIPPING_ADDRESS'
  | 'POSSIBLE_DUPLICATE' | 'READY_FOR_REVIEW' | 'WAITING_FOR_APPROVAL'
  | 'APPROVED' | 'CREATING_ZOHO_CUSTOMER' | 'CUSTOMER_CREATED' | 'FAILED' | 'CANCELLED';

export interface AddressDraft {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface CustomerDraft {
  id: string;
  organization_id: string;
  source: 'WATI';
  normalized_phone: string;
  wati_contact_id: string | null;
  conversation_id: string | null;
  company_name: string | null;
  contact_person_name: string | null;
  email: string | null;
  needs_faktur_pajak: boolean | null;
  npwp: string | null;
  billing_address: AddressDraft | null;
  shipping_address: AddressDraft | null;
  duplicate_check_status: 'NO_DUPLICATE' | 'LIKELY_DUPLICATE' | 'AMBIGUOUS' | null;
  duplicate_candidate_customer_ids: string[] | null;
  status: CustomerDraftStatus;
  created_customer_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function createCustomerDraft(input: { normalizedPhone: string; watiContactId?: string | null; conversationId?: string | null }): Promise<CustomerDraft> {
  const row = await supabaseInsert<CustomerDraft>(TABLE, {
    normalized_phone: input.normalizedPhone,
    wati_contact_id: input.watiContactId ?? null,
    conversation_id: input.conversationId ?? null,
  });
  if (!row) throw new Error('Customer draft was not created.');
  return row;
}

/** Only one active (non-terminal) draft per phone is meaningful at a time for the onboarding conversation flow. */
export async function findActiveCustomerDraft(normalizedPhone: string): Promise<CustomerDraft | null> {
  const rows = await supabaseSelect<CustomerDraft>(
    TABLE,
    `normalized_phone=eq.${encodeURIComponent(normalizedPhone)}&status=not.in.(CUSTOMER_CREATED,FAILED,CANCELLED)&select=*&order=created_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

export async function getCustomerDraft(id: string): Promise<CustomerDraft | null> {
  const rows = await supabaseSelect<CustomerDraft>(TABLE, `id=eq.${encodeURIComponent(id)}&select=*`);
  return rows[0] ?? null;
}

/** Any field update increments version, invalidating a bound approval (brief section 12). */
export async function updateCustomerDraft(id: string, currentVersion: number, patch: Partial<Omit<CustomerDraft, 'id' | 'version'>>): Promise<CustomerDraft> {
  const rows = await supabasePatch<CustomerDraft>(TABLE, `id=eq.${encodeURIComponent(id)}&version=eq.${currentVersion}`, {
    ...patch,
    version: currentVersion + 1,
    updated_at: new Date().toISOString(),
  });
  if (!rows[0]) throw new Error('Customer draft was modified concurrently; reload before retrying.');
  return rows[0];
}

export async function listCustomerDraftsByStatus(statuses: CustomerDraftStatus[]): Promise<CustomerDraft[]> {
  return supabaseSelect<CustomerDraft>(TABLE, `status=in.(${statuses.join(',')})&select=*&order=updated_at.desc&limit=200`);
}
