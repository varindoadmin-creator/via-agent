import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type WebhookRow = {
  id: string;
  external_event_id: string;
  event_type: 'message' | 'status' | 'unknown';
  received_at: string;
  status: string;
  payload_json: Record<string, unknown>;
};

function readText(payload: Record<string, unknown>) {
  const text = payload.text;
  if (text && typeof text === 'object' && !Array.isArray(text) && typeof (text as Record<string, unknown>).body === 'string') return (text as Record<string, unknown>).body as string;
  const interactive = payload.interactive;
  if (interactive && typeof interactive === 'object' && !Array.isArray(interactive)) {
    const button = (interactive as Record<string, unknown>).button_reply;
    if (button && typeof button === 'object' && !Array.isArray(button) && typeof (button as Record<string, unknown>).title === 'string') return (button as Record<string, unknown>).title as string;
  }
  return null;
}

export async function GET() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) return NextResponse.json({ success: false, error: 'WhatsApp event storage is not configured.' }, { status: 503 });

  try {
    const response = await fetch(`${base}/rest/v1/webhook_events?provider=eq.whatsapp&select=id,external_event_id,event_type,received_at,status,payload_json&order=received_at.desc&limit=100`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    const rows = await response.json() as WebhookRow[];
    const events = rows.map(row => {
      const payload = row.payload_json || {};
      return {
        id: row.id,
        external_event_id: row.external_event_id,
        event_type: row.event_type,
        received_at: row.received_at,
        status: row.status,
        from: typeof payload.from === 'string' ? payload.from : null,
        message_type: typeof payload.type === 'string' ? payload.type : null,
        message_text: readText(payload),
        event_status: typeof payload.status === 'string' ? payload.status : null,
      };
    });
    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error('[WhatsAppInbox]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load WhatsApp events.' }, { status: 500 });
  }
}
