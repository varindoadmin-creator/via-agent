// ─── CustomerChannelIdentity ─────────────────────────────────────────────────
// Brief sections 4-5: VIA is the sole source of truth for WhatsApp <-> Zoho
// Customer mapping. One phone may have zero, one, or many active rows (one
// per linked Zoho customer). This module never guesses — multiple mappings
// always route to "ask" (resolveCustomerIdentities returns MANY, never an
// auto-pick), and a single mapping never gets asked about again.

import { supabaseSelect, supabaseInsert, supabasePatch } from '../supabase/rest.ts';

const TABLE = 'customer_channel_identities';

export type RelationshipStatus = 'VERIFIED' | 'UNVERIFIED' | 'DISABLED';
export type MappingSource = 'CUSTOMER_CONFIRMED' | 'ADMIN_CONFIRMED' | 'ZOHO_CONTACT_MATCH' | 'IMPORTED' | 'ONBOARDING_CREATED';

export interface CustomerChannelIdentity {
  id: string;
  organization_id: string;
  channel: 'WHATSAPP';
  provider: 'WATI';
  normalized_phone: string;
  wati_contact_id: string | null;
  customer_id: string;
  relationship_status: RelationshipStatus;
  source: MappingSource;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export type IdentityResolution =
  | { status: 'NONE' }
  | { status: 'ONE'; mapping: CustomerChannelIdentity }
  | { status: 'MANY'; mappings: CustomerChannelIdentity[] };

/** Active = not DISABLED. Brief section 5: multiple active mappings must always ask, never auto-select. */
export async function resolveCustomerIdentities(normalizedPhone: string): Promise<IdentityResolution> {
  const rows = await supabaseSelect<CustomerChannelIdentity>(
    TABLE,
    `normalized_phone=eq.${encodeURIComponent(normalizedPhone)}&relationship_status=neq.DISABLED&select=*&order=created_at.asc`,
  );
  if (rows.length === 0) return { status: 'NONE' };
  if (rows.length === 1) return { status: 'ONE', mapping: rows[0] };
  return { status: 'MANY', mappings: rows };
}

export async function createChannelIdentity(input: {
  normalizedPhone: string;
  watiContactId?: string | null;
  customerId: string;
  source: MappingSource;
  relationshipStatus?: RelationshipStatus;
  verifiedBy?: string | null;
}): Promise<CustomerChannelIdentity> {
  const now = new Date().toISOString();
  const row = await supabaseInsert<CustomerChannelIdentity>(TABLE, {
    normalized_phone: input.normalizedPhone,
    wati_contact_id: input.watiContactId ?? null,
    customer_id: input.customerId,
    source: input.source,
    relationship_status: input.relationshipStatus ?? 'UNVERIFIED',
    verified_at: input.relationshipStatus === 'VERIFIED' ? now : null,
    verified_by: input.verifiedBy ?? null,
  });
  if (!row) throw new Error('Zoho customer mapping was not created.');
  return row;
}

export async function disableChannelIdentity(id: string, disabledBy: string): Promise<void> {
  await supabasePatch(TABLE, `id=eq.${encodeURIComponent(id)}`, {
    relationship_status: 'DISABLED',
    verified_by: disabledBy,
    updated_at: new Date().toISOString(),
  });
}

export async function verifyChannelIdentity(id: string, verifiedBy: string): Promise<void> {
  await supabasePatch(TABLE, `id=eq.${encodeURIComponent(id)}`, {
    relationship_status: 'VERIFIED',
    verified_by: verifiedBy,
    verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function listChannelIdentitiesForAdmin(): Promise<CustomerChannelIdentity[]> {
  return supabaseSelect<CustomerChannelIdentity>(TABLE, 'select=*&order=created_at.desc&limit=500');
}
