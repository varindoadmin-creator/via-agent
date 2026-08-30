import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { JARVIS_FEEDBACK_TYPES, storeJarvisFeedback } from '@/lib/jarvis/production/feedback';

function parsePayload(value: unknown): { runId: string; conversationId: string; type: typeof JARVIS_FEEDBACK_TYPES[number]; note?: string } | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  const runId = typeof payload.runId === 'string' ? payload.runId.trim() : '';
  const conversationId = typeof payload.conversationId === 'string' ? payload.conversationId.trim() : '';
  const note = typeof payload.note === 'string' ? payload.note.trim() : undefined;
  const type = typeof payload.type === 'string' ? payload.type : '';
  if (!runId || runId.length > 160 || !conversationId || conversationId.length > 160 || !JARVIS_FEEDBACK_TYPES.includes(type as typeof JARVIS_FEEDBACK_TYPES[number]) || (note && note.length > 2_000)) return null;
  return { runId, conversationId, type: type as typeof JARVIS_FEEDBACK_TYPES[number], note };
}

export async function POST(req: NextRequest) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const parsed = parsePayload(await req.json());
  if (!parsed) return NextResponse.json({ error: 'INVALID_FEEDBACK' }, { status: 400 });
  try {
    const status = await storeJarvisFeedback({ ...parsed, actorRole: role });
    return NextResponse.json({ status });
  } catch (error) {
    console.warn('[jarvis.feedback]', { event: 'store_failed', error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'FEEDBACK_UNAVAILABLE' }, { status: 503 });
  }
}
