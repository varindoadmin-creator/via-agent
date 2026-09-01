// ─── Customer contact / ownership lookups ─────────────────────────────────────
// VIA Customer Operations Phase 11: small reverse lookups the detectors need
// that no existing module exposes (per the Phase 11 audit: sync.ts only
// exports the salesperson-map sync job, not a lookup-by-customer function).

import { supabaseSelect } from '../supabase/rest.ts';

interface ChannelIdentityRow { normalized_phone: string; relationship_status: string }

/** Prefers a VERIFIED mapping; falls back to the first active (non-DISABLED) one. Never guesses across multiple distinct customers — this is a forward lookup (one known customer_id -> its own phone), not identity resolution. */
export async function getPrimaryWhatsappForCustomer(customerId: string): Promise<string | null> {
  const rows = await supabaseSelect<ChannelIdentityRow>(
    'customer_channel_identities',
    `customer_id=eq.${encodeURIComponent(customerId)}&relationship_status=neq.DISABLED&select=normalized_phone,relationship_status&order=relationship_status.desc`,
  );
  return rows[0]?.normalized_phone ?? null;
}

interface SalespersonRow { salesperson_id: string; salesperson_name: string }

/** The customer's authoritative assigned salesperson (brief section 21) — never inferred from last chat. */
export async function getAssignedSalesperson(customerId: string): Promise<{ salespersonId: string; salespersonName: string } | null> {
  const rows = await supabaseSelect<SalespersonRow>(
    'customer_salesperson_map',
    `customer_id=eq.${encodeURIComponent(customerId)}&select=salesperson_id,salesperson_name&order=times_seen.desc&limit=1`,
  );
  return rows[0] ? { salespersonId: rows[0].salesperson_id, salespersonName: rows[0].salesperson_name } : null;
}
