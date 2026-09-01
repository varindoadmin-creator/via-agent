// ─── Message frequency control ────────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief section 17: a customer-level
// cooldown so multiple independent detectors never bombard the same
// customer. Env-configured, not a hardcoded arbitrary number.

import { supabaseSelect } from '../supabase/rest.ts';

const TABLE = 'proactive_customer_actions';

function envHours(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Section 17's configurable cooldown window between commercial/marketing proactive contacts to the same customer. */
export function getProactiveCooldownHours(): number {
  return envHours('PROACTIVE_CONTACT_COOLDOWN_HOURS', 72);
}

interface RecentSendRow { sent_at: string }

/** True when this phone number received any commercial/marketing proactive WHATSAPP send within the cooldown window. */
export async function isWithinProactiveCooldown(customerPhoneNormalized: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - getProactiveCooldownHours() * 60 * 60_000).toISOString();
  const rows = await supabaseSelect<RecentSendRow>(
    TABLE,
    `customer_phone_normalized=eq.${encodeURIComponent(customerPhoneNormalized)}&channel=eq.WHATSAPP&status=in.(SENT,CUSTOMER_RESPONDED,CONVERTED)&sent_at=gte.${cutoff}&select=sent_at&order=sent_at.desc&limit=1`,
  );
  return rows.length > 0;
}
