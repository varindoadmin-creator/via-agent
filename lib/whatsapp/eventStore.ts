import type { WhatsAppEvent } from './webhook';

const TABLE = 'webhook_events';
function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) throw new Error('WhatsApp webhook storage is not configured.');
  return { url: `${base}/rest/v1/${TABLE}`, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
export type WebhookRecordResult = 'recorded' | 'duplicate';
/** The database unique key keeps duplicate protection correct across Cloud Run instances. */
export async function recordWhatsAppEvent(event: WhatsAppEvent): Promise<WebhookRecordResult> {
  const db = database();
  const response = await fetch(`${db.url}?on_conflict=provider,external_event_id`, { method: 'POST', headers: { ...db.headers, Prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify({ provider: event.provider, external_event_id: event.externalEventId, event_type: event.eventType, phone_number_id: event.phoneNumberId, received_at: new Date().toISOString(), processed_at: new Date().toISOString(), status: 'received', payload_json: event.raw }) });
  if (!response.ok) throw new Error(`Unable to record WhatsApp webhook event (${response.status}).`);
  const rows = await response.json() as Array<{ external_event_id?: string }>;
  return rows.length ? 'recorded' : 'duplicate';
}
