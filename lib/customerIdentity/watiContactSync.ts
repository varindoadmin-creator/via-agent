// ─── WATI contact sync ────────────────────────────────────────────────────────
// Brief sections 16-20, 61: pushes customer-safe fields from Zoho/VIA to WATI.
// WATI is never authoritative — this is one-directional (Zoho/VIA -> WATI).
// Sensitive fields (NPWP, credit limit, outstanding AR, margin, supplier data,
// pricing strategy, exact stock, credit risk — brief section 17) are
// structurally excluded: buildSyncableAttributes never reads them from the
// input in the first place, the same "never fetched/never in the payload"
// pattern used for cost/margin in Phase 5's pricing DTOs.

import type { ZohoContact } from '../../types/zoho.ts';
import { updateWatiContactAttributes, type WatiSendResult } from '../integrations/wati/client.ts';
import { supabaseInsert } from '../supabase/rest.ts';
import { isWatiContactSyncEnabled } from './featureFlags.ts';

const LOG_TABLE = 'wati_contact_sync_log';

export function buildSyncableAttributes(customer: ZohoContact): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (customer.company_name || customer.contact_name) attrs.company_name = customer.company_name || customer.contact_name;
  const primaryContact = customer.contact_persons?.find(p => p.is_primary_contact) ?? customer.contact_persons?.[0];
  if (primaryContact) attrs.contact_person = [primaryContact.first_name, primaryContact.last_name].filter(Boolean).join(' ');
  attrs.zoho_customer_id = customer.contact_id;
  if (customer.salesperson_name) attrs.salesperson = customer.salesperson_name;
  if (customer.contact_type) attrs.customer_type = customer.contact_type;
  if (customer.billing_address?.city) attrs.billing_city = customer.billing_address.city;
  return attrs;
}

export interface ContactSyncResult {
  status: 'SYNCED' | 'SYNC_FAILED_RETRYABLE' | 'SYNC_FAILED_FINAL';
  syncedFields?: Record<string, string>;
  error?: string;
}

/**
 * Syncs a single mapping's customer to WATI and logs the attempt. Never
 * throws — a WATI outage must never roll back or block a valid Zoho customer
 * creation or mapping (brief section 61); the caller proceeds regardless.
 */
export async function syncCustomerToWati(input: { channelIdentityId: string; normalizedPhone: string; customer: ZohoContact }): Promise<ContactSyncResult> {
  const attrs = buildSyncableAttributes(input.customer);
  let result: ContactSyncResult;
  let sendResult: WatiSendResult;
  if (!isWatiContactSyncEnabled()) {
    sendResult = 'disabled';
  } else {
    try {
      sendResult = await updateWatiContactAttributes(input.normalizedPhone, attrs);
    } catch {
      sendResult = 'failed';
    }
  }

  if (sendResult === 'sent') {
    result = { status: 'SYNCED', syncedFields: attrs };
  } else if (sendResult === 'disabled') {
    // Not configured yet — retryable once WATI credentials/attributes are set up (brief section 59).
    result = { status: 'SYNC_FAILED_RETRYABLE', error: 'WATI contact-attribute sync is not configured.' };
  } else {
    result = { status: 'SYNC_FAILED_RETRYABLE', error: 'WATI contact sync request failed.' };
  }

  try {
    await supabaseInsert(LOG_TABLE, {
      customer_channel_identity_id: input.channelIdentityId,
      status: result.status,
      synced_fields: result.syncedFields ?? null,
      error: result.error ?? null,
      synced_at: result.status === 'SYNCED' ? new Date().toISOString() : null,
    }, false);
  } catch (err) {
    console.error('[watiContactSync] failed to write sync log:', err);
  }

  return result;
}
