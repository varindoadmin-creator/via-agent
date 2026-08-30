// ─── Deterministic case priority ─────────────────────────────────────────────
// VIA Customer Operations Phase 8, brief section 13: never AI emotion
// detection, never customer revenue/value. A small fixed set of real signals
// only.

import type { HandoffReason } from './handoffReasons.ts';

export type CasePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

const PRIORITY_RANK: Record<CasePriority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };

function higherOf(a: CasePriority, b: CasePriority): CasePriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

const URGENT_CUSTOMER_PHRASE = /\burgent\b|\bmendesak\b|\bdarurat\b|\bsegera\b/i;

export interface PriorityInput {
  reason: HandoffReason;
  customerMessageText?: string;
  /** Set when this handoff is a duplicate trigger on an already-open case that has since breached SLA — escalates one level rather than staying flat. */
  slaAlreadyBreached?: boolean;
  /** Set when this is not the customer's first unresolved contact about the same case (brief section 13's "repeat unresolved contact"). */
  isRepeatContact?: boolean;
}

export function computeInitialPriority(input: PriorityInput): CasePriority {
  let priority: CasePriority = 'NORMAL';

  if (input.reason === 'COMPLAINT' || input.reason === 'SECURITY_SENSITIVE_REQUEST') {
    priority = higherOf(priority, 'HIGH');
  }
  if (input.reason === 'PAYMENT_REVIEW' || input.reason === 'PAYMENT_PROOF_RECEIVED') {
    priority = higherOf(priority, 'HIGH'); // brief section 13: "payment problem"
  }
  if (input.reason === 'DELIVERY_STATUS_UNAVAILABLE' || input.reason === 'ORDER_MODIFICATION' || input.reason === 'ORDER_CANCELLATION') {
    priority = higherOf(priority, 'HIGH'); // "order blocked" / "delivery issue"
  }
  if (input.customerMessageText && URGENT_CUSTOMER_PHRASE.test(input.customerMessageText)) {
    priority = higherOf(priority, 'HIGH');
  }
  if (input.isRepeatContact) {
    priority = higherOf(priority, 'HIGH');
  }
  if (input.slaAlreadyBreached) {
    priority = escalateOneLevel(priority);
  }

  return priority;
}

export function escalateOneLevel(priority: CasePriority): CasePriority {
  const order: CasePriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
  const index = order.indexOf(priority);
  return order[Math.min(index + 1, order.length - 1)];
}
