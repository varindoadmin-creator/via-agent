import { NextResponse } from 'next/server';
import { supabaseSelect } from '@/lib/supabase/rest';
import { deriveWaitingState } from '@/lib/customerService/waitingState';
import { computeCaseSlaStatus } from '@/lib/customerService/sla';
import { getCustomerById } from '@/lib/zoho/customers';

export const dynamic = 'force-dynamic';

interface CaseRow {
  customer_phone_normalized: string;
  state: string;
  priority: string;
  assigned_role: string | null;
  assigned_team: string | null;
  handoff_reason: string | null;
  handoff_created_at: string | null;
  human_assigned_at: string | null;
  resolved_at: string | null;
  active_customer_id: string | null;
  updated_at: string;
}

interface MessageRow { text: string | null; received_at: string }

// GET /api/requests/wati/customer-service/cases — the Phase 8 unified queue
// (brief section 23): every conversation currently needing attention, plus
// recently resolved ones. Views/filtering happen client-side on this list.
export async function GET() {
  try {
    const cases = await supabaseSelect<CaseRow>(
      'wati_conversation_state',
      'state=not.eq.AUTO&select=customer_phone_normalized,state,priority,assigned_role,assigned_team,handoff_reason,handoff_created_at,human_assigned_at,resolved_at,active_customer_id,updated_at&order=updated_at.desc&limit=200',
    );

    const enriched = await Promise.all(cases.map(async c => {
      const [waitingState, lastMessage, customer] = await Promise.all([
        deriveWaitingState({ conversationId: c.customer_phone_normalized, hasPendingSelfService: false }).catch(() => null),
        supabaseSelect<MessageRow>('wati_messages', `customer_phone_normalized=eq.${encodeURIComponent(c.customer_phone_normalized)}&direction=eq.INBOUND&select=text,received_at&order=received_at.desc&limit=1`).catch(() => []),
        c.active_customer_id ? getCustomerById(c.active_customer_id).catch(() => null) : Promise.resolve(null),
      ]);
      const slaStatus = c.handoff_created_at ? computeCaseSlaStatus(new Date(c.handoff_created_at)) : null;
      return {
        ...c,
        waitingState,
        slaStatus,
        lastCustomerMessage: lastMessage[0]?.text ?? null,
        customerName: customer?.company_name || customer?.contact_name || null,
      };
    }));

    return NextResponse.json({ success: true, cases: enriched });
  } catch (error) {
    console.error('[CustomerServiceQueue]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load the customer service queue.' }, { status: 500 });
  }
}
