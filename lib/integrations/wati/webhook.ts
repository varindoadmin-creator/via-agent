import { timingSafeEqual } from 'node:crypto';

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export type WatiWebhookMetadata = {
  eventType: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
/**
 * WATI webhooks can be configured with a dedicated API key sent in the
 * Authorization header. Only enforce it when the Cloud Run secret exists, so
 * local payload capture remains possible before that WATI setting is enabled.
 */
export function isAuthorizedWatiWebhook(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return true;
  const supplied = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export function acceptsJsonContentType(contentType: string | null): boolean {
  return Boolean(contentType?.toLowerCase().startsWith('application/json'));
}

export function exceedsWatiWebhookLimit(contentLength: string | null, body: string): boolean {
  const declared = Number(contentLength);
  return (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) || Buffer.byteLength(body, 'utf8') > MAX_WEBHOOK_BYTES;
}

/** Generic by design: WATI event payloads are captured before being modelled. */
export function parseWatiWebhookPayload(rawBody: string): { payload: Record<string, unknown>; metadata: WatiWebhookMetadata } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const payload = asRecord(parsed);
  if (!payload) return null;
  const eventCandidate = payload.eventType ?? payload.event ?? payload.type;
  return { payload, metadata: { eventType: typeof eventCandidate === 'string' && eventCandidate.trim() ? eventCandidate : null } };
}
