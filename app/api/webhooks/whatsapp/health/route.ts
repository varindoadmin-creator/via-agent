import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json({ ok: true, service: 'whatsapp-webhook', configured: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && process.env.META_APP_SECRET) }); }
