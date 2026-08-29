import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { acceptsJsonContentType, exceedsWatiWebhookLimit, isAuthorizedWatiWebhook, parseWatiWebhookPayload } from '@/lib/integrations/wati/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

/**
 * Public WATI callback acknowledgement only. It intentionally does not store,
 * route, classify, or reply to messages; those are separate milestones.
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = randomUUID();
  try {
    if (!acceptsJsonContentType(request.headers.get('content-type'))) {
      return NextResponse.json({ ok: false, error: 'Content-Type must be application/json' }, { status: 415 });
    }
    if (!isAuthorizedWatiWebhook(request.headers.get('authorization'), process.env.WATI_WEBHOOK_SECRET)) {
      console.warn('[wati.webhook]', JSON.stringify({ event: 'rejected', requestId, reason: 'unauthorized', durationMs: Date.now() - startedAt }));
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.text();
    if (exceedsWatiWebhookLimit(request.headers.get('content-length'), rawBody)) {
      console.warn('[wati.webhook]', JSON.stringify({ event: 'rejected', requestId, reason: 'payload_too_large', durationMs: Date.now() - startedAt }));
      return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
    }
    const parsed = parseWatiWebhookPayload(rawBody);
    if (!parsed) {
      console.warn('[wati.webhook]', JSON.stringify({ event: 'rejected', requestId, reason: 'invalid_json_or_non_object', durationMs: Date.now() - startedAt }));
      return NextResponse.json({ ok: false, error: 'Invalid JSON webhook payload' }, { status: 400 });
    }

    console.info('[wati.webhook]', JSON.stringify({
      event: 'wati.webhook.received',
      requestId,
      eventType: parsed.metadata.eventType,
      receivedAt: new Date().toISOString(),
      status: 200,
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json({ ok: true, integration: 'wati' });
  } catch (error) {
    console.error('[wati.webhook]', JSON.stringify({
      event: 'wati.webhook.failed',
      requestId,
      error: error instanceof Error ? error.name : 'unknown_error',
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json({ ok: false, error: 'Webhook processing failed' }, { status: 500 });
  }
}
