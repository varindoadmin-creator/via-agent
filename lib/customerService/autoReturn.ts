// ─── Idle-active auto-return sweep ────────────────────────────────────────────
// 2026-09-02: "end of day, return everyone to VIA" was rejected as too broad
// — it would also flip back cases where a human never actually responded
// (silently breaking the "we'll connect you to Admin" promise) or where a
// human is still mid-investigation. This is the narrower version, gated by
// `AUTO_RETURN_TO_VIA_ENABLED` (previously defined but never wired to
// anything): only `HUMAN_ACTIVE` cases — i.e. a human already explicitly
// clicked "Take Over" — where the customer has gone quiet for
// CS_AUTO_RETURN_IDLE_HOURS (default 24h) and the reason/priority isn't
// urgent. `NEEDS_HUMAN`/`HUMAN_ASSIGNED` cases (nobody has taken over yet)
// and HIGH/URGENT or COMPLAINT/SECURITY/PAYMENT/ZOHO-failure reasons are
// never auto-returned — those always require an explicit human "Resolve".
// Note: `human_first_response_at` exists on the schema but nothing in this
// codebase ever sets it, so "a human already replied" isn't independently
// verifiable — `state === 'HUMAN_ACTIVE'` (an explicit Take Over click) is
// the strongest real signal available and is used as that proxy instead.

import { supabaseSelect } from '../supabase/rest.ts';
import { updateServiceCase } from '../integrations/wati/conversationState.ts';
import { recordServiceEvent } from './auditLog.ts';
import { URGENT_REASONS } from './handoff.ts';
import { isAutoReturnToViaEnabled } from '../customerIdentity/featureFlags.ts';

interface IdleActiveCaseRow {
  customer_phone_normalized: string;
  handoff_reason: string | null;
  priority: string;
  last_inbound_at: string | null;
  version: number;
}

export function autoReturnIdleHours(): number {
  const value = Number(process.env.CS_AUTO_RETURN_IDLE_HOURS);
  return Number.isFinite(value) && value > 0 ? value : 24;
}

export interface AutoReturnResult {
  returned: number;
  skipped: number;
}

export async function autoReturnIdleActiveCases(): Promise<AutoReturnResult> {
  if (!isAutoReturnToViaEnabled()) return { returned: 0, skipped: 0 };

  const cutoff = new Date(Date.now() - autoReturnIdleHours() * 60 * 60 * 1000).toISOString();
  const excludedReasons = Array.from(URGENT_REASONS).join(',');
  const candidates = await supabaseSelect<IdleActiveCaseRow>(
    'wati_conversation_state',
    `state=eq.HUMAN_ACTIVE&priority=not.in.(HIGH,URGENT)&handoff_reason=not.in.(${excludedReasons})&last_inbound_at=lt.${encodeURIComponent(cutoff)}&select=customer_phone_normalized,handoff_reason,priority,last_inbound_at,version`,
  );

  let returned = 0;
  let skipped = 0;
  for (const c of candidates) {
    // Optimistic concurrency: a human interacting with the case right now
    // (which would have already bumped last_inbound_at/version) loses this
    // race safely — the sweep just skips it rather than clobbering a
    // concurrent human action, same guarantee as the dashboard's own actions.
    const updated = await updateServiceCase(c.customer_phone_normalized, { state: 'AUTO', assigned_role: null }, c.version).catch(() => null);
    if (!updated) { skipped++; continue; }
    await recordServiceEvent({
      normalizedPhone: c.customer_phone_normalized, eventType: 'service.returned_to_auto', actor: 'SYSTEM',
      fromValue: 'HUMAN_ACTIVE', toValue: 'AUTO', metadata: { reason: 'idle_auto_return', idleHours: autoReturnIdleHours() },
    });
    returned++;
  }
  return { returned, skipped };
}
