// ─── Canonical analytics events ──────────────────────────────────────────────
// VIA Customer Operations Phase 9, brief sections 4-6: a small, additive
// event table for funnel-stage transitions no existing table durably
// captures as a single fact. Idempotent by construction — a duplicate
// dedupeKey is silently ignored (same Supabase upsert-with-ignore-duplicates
// pattern lib/integrations/wati/store.ts already uses for wati_messages).

import { supabaseTable } from '../supabase/rest.ts';

const TABLE = 'analytics_events';

export type AnalyticsEventType =
  | 'lead.created' | 'product.inquiry' | 'stock.inquiry' | 'price.inquiry'
  | 'handoff.created' | 'commercial_draft.created' | 'quotation.created'
  | 'order.created' | 'customer.onboarding.completed';

export interface RecordAnalyticsEventInput {
  eventType: AnalyticsEventType;
  /** The source record's own stable ID (e.g. a wati_messages.id, a commercial_drafts.id) — combined with eventType to form the idempotency key. Never a random UUID, or duplicates would never be caught. */
  sourceId: string;
  /** Event time, not processing time (brief section 6) — defaults to now() only when the caller genuinely has no better timestamp. */
  occurredAt?: Date;
  conversationId?: string | null;
  customerId?: string | null;
  productId?: string | null;
  inquiryId?: string | null;
  draftId?: string | null;
  orderId?: string | null;
  source?: string | null;
  channel?: string | null;
  actorType?: string | null;
  teamId?: string | null;
  properties?: Record<string, string | number | boolean | null>;
}

/** Never throws — an analytics-recording failure must never break the operational flow it's observing. */
export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput): Promise<void> {
  try {
    const db = supabaseTable(TABLE);
    const dedupeKey = `${input.eventType}:${input.sourceId}`;
    const response = await fetch(`${db.url}?on_conflict=dedupe_key`, {
      method: 'POST',
      headers: { ...db.headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        event_type: input.eventType,
        occurred_at: (input.occurredAt ?? new Date()).toISOString(),
        conversation_id: input.conversationId ?? null,
        customer_id: input.customerId ?? null,
        product_id: input.productId ?? null,
        inquiry_id: input.inquiryId ?? null,
        draft_id: input.draftId ?? null,
        order_id: input.orderId ?? null,
        source: input.source ?? null,
        channel: input.channel ?? null,
        actor_type: input.actorType ?? null,
        team_id: input.teamId ?? null,
        properties: input.properties ?? null,
        dedupe_key: dedupeKey,
      }),
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}: ${await response.text()}`);
  } catch (error) {
    console.error('[analytics.events] failed to record event:', input.eventType, error);
  }
}
