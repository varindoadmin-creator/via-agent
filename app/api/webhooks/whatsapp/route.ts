import { NextRequest, NextResponse } from 'next/server';
import { recordWhatsAppEvent } from '@/lib/whatsapp/eventStore';
import { isWhatsAppWebhookPayload, normalizeWhatsAppWebhook, verifyWhatsAppChallenge, verifyWhatsAppSignature } from '@/lib/whatsapp/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
const MAX_PAYLOAD_BYTES = 1024 * 1024;

export function GET(request: NextRequest) {
  const challenge = verifyWhatsAppChallenge({ mode: request.nextUrl.searchParams.get('hub.mode'), verifyToken: request.nextUrl.searchParams.get('hub.verify_token'), challenge: request.nextUrl.searchParams.get('hub.challenge') }, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '');
  if (challenge == null) return new NextResponse('Forbidden', { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_PAYLOAD_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    if (!verifyWhatsAppSignature(rawBody, request.headers.get('x-hub-signature-256'), process.env.META_APP_SECRET || '')) { console.warn('[WhatsAppWebhook] rejected invalid signature'); return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    if (!isWhatsAppWebhookPayload(payload)) return NextResponse.json({ error: 'Unsupported webhook payload' }, { status: 400 });
    const events = normalizeWhatsAppWebhook(payload);
    const outcomes = await Promise.all(events.map(async event => {
      const outcome = await recordWhatsAppEvent(event);
      if (outcome === 'recorded') console.info('[WhatsAppWebhook]', JSON.stringify({ provider: event.provider, event_type: event.eventType, message_id: event.externalEventId, phone_number_id: event.phoneNumberId, from: event.from, message_type: event.messageType, status: event.status }));
      return outcome;
    }));
    return NextResponse.json({ ok: true, received: events.length, recorded: outcomes.filter(x => x === 'recorded').length, duplicates: outcomes.filter(x => x === 'duplicate').length });
  } catch (error) {
    console.error('[WhatsAppWebhook] ingestion failed', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Webhook ingestion failed' }, { status: 503 });
  }
}
