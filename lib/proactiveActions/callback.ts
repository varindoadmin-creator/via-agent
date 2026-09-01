// ─── Customer callback ──────────────────────────────────────────────────────
// VIA Customer Operations Phase 11, brief section 24: an explicit callback
// task, created on demand (not by a sweep) the moment a customer asks for
// one. Never pretends a call has occurred — this only ever creates an
// internal task; a human must actually place the call and separately mark
// it done via lib/proactiveActions/store.ts's markConverted.

import { upsertAction } from './store.ts';
import type { ProactiveActionCandidate, ServiceTeam } from './types.ts';

export interface CreateCallbackInput {
  customerPhoneNormalized: string;
  conversationId?: string | null;
  customerId?: string | null;
  requestedTime?: string | null;
  context: string;
  assignedTeam?: ServiceTeam;
}

export async function createCustomerCallback(input: CreateCallbackInput) {
  const candidate: ProactiveActionCandidate = {
    type: 'CUSTOMER_CALLBACK',
    customerId: input.customerId ?? null, customerPhoneNormalized: input.customerPhoneNormalized,
    conversationId: input.conversationId ?? input.customerPhoneNormalized,
    reason: input.requestedTime ? `Customer requested a callback at ${input.requestedTime}.` : 'Customer requested a callback.',
    evidence: [{ label: 'Context', value: input.context }, ...(input.requestedTime ? [{ label: 'Requested time', value: input.requestedTime }] : [])],
    recommendedAction: 'Call the customer back.',
    channel: 'INTERNAL_TASK', assignedTeam: input.assignedTeam ?? 'CUSTOMER_SERVICE', priority: 'HIGH',
    dueAt: input.requestedTime ?? null,
    dedupeKey: `CUSTOMER_CALLBACK:${input.customerPhoneNormalized}:${new Date().toISOString()}`,
  };
  return upsertAction(candidate, 'DETECTED', false);
}
