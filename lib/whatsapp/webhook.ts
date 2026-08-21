import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type WhatsAppMessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'interactive' | 'button_reply' | 'location' | 'contacts' | 'unknown';
export type WhatsAppEvent = { provider: 'whatsapp'; eventType: 'message' | 'status' | 'unknown'; externalEventId: string; phoneNumberId: string | null; waId: string | null; from: string | null; timestamp: string | null; messageType?: WhatsAppMessageType; status?: 'sent' | 'delivered' | 'read' | 'failed' | 'unknown'; text?: string | null; raw: Record<string, unknown> };
type MetaValue = { metadata?: { phone_number_id?: unknown }; messages?: unknown; statuses?: unknown };

function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function stringOrNull(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }
function stableUnknownId(value: unknown): string { return `unknown:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }

/** Validates Meta's raw-body sha256 HMAC without exposing the secret. */
export function verifyWhatsAppSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=') || !appSecret) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const supplied = header.slice('sha256='.length);
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

export function verifyWhatsAppChallenge(input: { mode: string | null; verifyToken: string | null; challenge: string | null }, expectedToken: string): string | null {
  if (!expectedToken || input.mode !== 'subscribe' || !input.challenge || input.verifyToken == null || input.verifyToken.length !== expectedToken.length) return null;
  return timingSafeEqual(Buffer.from(input.verifyToken), Buffer.from(expectedToken)) ? input.challenge : null;
}

function normalizeMessage(value: MetaValue, raw: Record<string, unknown>): WhatsAppEvent {
  const type = stringOrNull(raw.type) || 'unknown';
  const interactive = asRecord(raw.interactive);
  const subtype = stringOrNull(interactive?.type);
  const messageType: WhatsAppMessageType = type === 'text' || type === 'image' || type === 'document' || type === 'audio' || type === 'video' || type === 'location' || type === 'contacts' ? type : type === 'interactive' && subtype === 'button_reply' ? 'button_reply' : type === 'interactive' ? 'interactive' : 'unknown';
  const text = messageType === 'text' ? stringOrNull(asRecord(raw.text)?.body) : messageType === 'button_reply' ? stringOrNull(asRecord(interactive?.button_reply)?.title) : null;
  return { provider: 'whatsapp', eventType: 'message', externalEventId: stringOrNull(raw.id) || stableUnknownId(raw), phoneNumberId: stringOrNull(value.metadata?.phone_number_id), waId: stringOrNull(raw.from), from: stringOrNull(raw.from), timestamp: stringOrNull(raw.timestamp), messageType, text, raw };
}

function normalizeStatus(value: MetaValue, raw: Record<string, unknown>): WhatsAppEvent {
  const rawStatus = stringOrNull(raw.status);
  const status = rawStatus === 'sent' || rawStatus === 'delivered' || rawStatus === 'read' || rawStatus === 'failed' ? rawStatus : 'unknown';
  const recipient = stringOrNull(raw.recipient_id);
  return { provider: 'whatsapp', eventType: 'status', externalEventId: stringOrNull(raw.id) || stableUnknownId(raw), phoneNumberId: stringOrNull(value.metadata?.phone_number_id), waId: recipient, from: recipient, timestamp: stringOrNull(raw.timestamp), status, raw };
}

/** Converts Meta's nested webhook payload into a stable VIA event shape. */
export function normalizeWhatsAppWebhook(payload: unknown): WhatsAppEvent[] {
  const root = asRecord(payload);
  if (!root || root.object !== 'whatsapp_business_account' || !Array.isArray(root.entry)) return [];
  const events: WhatsAppEvent[] = [];
  for (const entry of root.entry) {
    const entryRecord = asRecord(entry);
    if (!entryRecord || !Array.isArray(entryRecord.changes)) continue;
    for (const change of entryRecord.changes) {
      const changeRecord = asRecord(change);
      const value = asRecord(changeRecord?.value) as MetaValue | null;
      if (!value || changeRecord?.field !== 'messages') continue;
      if (Array.isArray(value.messages)) for (const message of value.messages) { const raw = asRecord(message); if (raw) events.push(normalizeMessage(value, raw)); }
      if (Array.isArray(value.statuses)) for (const status of value.statuses) { const raw = asRecord(status); if (raw) events.push(normalizeStatus(value, raw)); }
    }
  }
  return events;
}

export function isWhatsAppWebhookPayload(payload: unknown): boolean { const root = asRecord(payload); return root?.object === 'whatsapp_business_account' && Array.isArray(root.entry); }
