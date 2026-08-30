import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { getServiceCase } from '@/lib/integrations/wati/conversationState';
import { deriveWaitingState } from '@/lib/customerService/waitingState';
import { buildHandoffContext } from '@/lib/customerService/handoffContext';
import { suggestReply } from '@/lib/customerService/copilot';
import { supabaseSelect } from '@/lib/supabase/rest';
import { isSuggestedRepliesEnabled } from '@/lib/customerIdentity/featureFlags';
import type { HandoffReason } from '@/lib/customerService/handoffReasons';

export const dynamic = 'force-dynamic';

interface MessageRow { text: string | null; direction: string }

// POST /api/requests/wati/customer-service/cases/[phone]/suggest-reply —
// brief section 27: drafted only, never sent automatically. The Admin must
// explicitly send it through the normal outbound send path (not built here)
// after reviewing/editing.
export async function POST(req: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  if (!isSuggestedRepliesEnabled()) return NextResponse.json({ success: false, error: 'Suggested replies are disabled (SUGGESTED_REPLIES_ENABLED is not set to true).' }, { status: 503 });

  const { phone } = await params;
  const normalizedPhone = decodeURIComponent(phone);
  try {
    const serviceCase = await getServiceCase(normalizedPhone);
    if (!serviceCase) return NextResponse.json({ success: false, error: 'No case found for this conversation.' }, { status: 404 });

    const [waitingState, recentMessages] = await Promise.all([
      deriveWaitingState({ conversationId: normalizedPhone, hasPendingSelfService: false }),
      supabaseSelect<MessageRow>('wati_messages', `customer_phone_normalized=eq.${encodeURIComponent(normalizedPhone)}&select=text,direction&order=received_at.desc&limit=8`),
    ]);
    const context = await buildHandoffContext({
      reason: (serviceCase.handoff_reason as HandoffReason) ?? null, normalizedPhone, conversationId: normalizedPhone,
      activeCustomerId: serviceCase.active_customer_id, currentIntent: null, waitingState,
    });
    const messages = recentMessages.reverse().filter(m => m.text).map(m => `${m.direction === 'INBOUND' ? 'Customer' : 'VIA'}: ${m.text}`);
    const draft = await suggestReply(context, messages);
    return NextResponse.json({ success: true, draft });
  } catch (error) {
    console.error('[CustomerServiceSuggestReply]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to generate a suggested reply.' }, { status: 500 });
  }
}
