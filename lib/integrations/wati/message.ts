// ─── WATI inbound message normalization ────────────────────────────────────────
// Converts WATI's raw "Message Received" webhook payload into VIA's
// provider-neutral CommunicationMessage shape (brief section 2). Written
// defensively against WATI's publicly documented webhook fields, since no real
// payload has been captured in this repo yet (the current webhook only logs
// `eventType`). The full raw payload is always kept (see store.ts) so the first
// real production message lets us confirm/adjust field names from the stored
// row without losing data in the meantime.

import { createHash } from 'node:crypto';

export type WatiMessageType = 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO' | 'LOCATION' | 'CONTACT' | 'UNKNOWN';
export type WatiDirection = 'INBOUND' | 'OUTBOUND';

export interface NormalizedWatiMessage {
  channel: 'WHATSAPP';
  provider: 'WATI';
  providerMessageId: string;
  providerConversationId: string | null;
  direction: WatiDirection;
  customerPhoneRaw: string | null;
  customerName: string | null;
  messageType: WatiMessageType;
  text: string | null;
  providerTimestamp: Date | null;
  raw: Record<string, unknown>;
}

function stableUnknownId(value: unknown): string {
  return `unknown:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const found = stringOrNull(payload[key]);
    if (found) return found;
  }
  return null;
}

function parseTimestamp(payload: Record<string, unknown>): Date | null {
  const created = stringOrNull(payload.created) || stringOrNull(payload.timestamp);
  if (!created) return null;
  // WATI has been observed to send both ISO strings and unix-seconds strings.
  if (/^\d+$/.test(created)) {
    const ms = created.length > 10 ? Number(created) : Number(created) * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(created);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeMessageType(payload: Record<string, unknown>): WatiMessageType {
  const type = (stringOrNull(payload.type) || '').toLowerCase();
  switch (type) {
    case 'text': return 'TEXT';
    case 'image': return 'IMAGE';
    case 'document': return 'DOCUMENT';
    case 'audio':
    case 'voice': return 'AUDIO';
    case 'video': return 'VIDEO';
    case 'location': return 'LOCATION';
    case 'contact':
    case 'contacts': return 'CONTACT';
    default: return type === 'text' ? 'TEXT' : payload.text ? 'TEXT' : 'UNKNOWN';
  }
}

function extractText(payload: Record<string, unknown>): string | null {
  const direct = stringOrNull(payload.text);
  if (direct) return direct;
  const textObj = asRecord(payload.text);
  const nested = stringOrNull(textObj?.body);
  if (nested) return nested;
  const button = asRecord(payload.buttonReply);
  const buttonText = stringOrNull(button?.text) || stringOrNull(button?.title);
  if (buttonText) return buttonText;
  const list = asRecord(payload.listReply);
  const listText = stringOrNull(list?.title);
  if (listText) return listText;
  return null;
}

/**
 * `owner: true` on WATI's payload means the message was sent BY the business
 * (operator/API), not the customer — those must never be treated as inbound
 * customer messages. Absent the field, default to treating it as inbound,
 * since the webhook is configured for "Message Received" events.
 */
function isOutboundEcho(payload: Record<string, unknown>): boolean {
  return payload.owner === true || payload.eventType === 'sentMessage';
}

export function normalizeWatiMessage(payload: Record<string, unknown>): NormalizedWatiMessage {
  const providerMessageId = firstString(payload, ['whatsappMessageId', 'id', 'messageId']) || stableUnknownId(payload);
  const providerConversationId = firstString(payload, ['conversationId', 'ticketId']);
  const customerPhoneRaw = firstString(payload, ['waId', 'phone', 'whatsappNumber']);
  const customerName = firstString(payload, ['senderName', 'name']);

  return {
    channel: 'WHATSAPP',
    provider: 'WATI',
    providerMessageId,
    providerConversationId,
    direction: isOutboundEcho(payload) ? 'OUTBOUND' : 'INBOUND',
    customerPhoneRaw,
    customerName,
    messageType: normalizeMessageType(payload),
    text: extractText(payload),
    providerTimestamp: parseTimestamp(payload),
    raw: payload,
  };
}
