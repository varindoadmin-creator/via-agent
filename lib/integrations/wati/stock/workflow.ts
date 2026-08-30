// ─── Stock inquiry workflow state machine ───────────────────────────────────────
// Brief section 4: explicit durable states, validated server-side — never a
// simplistic OPEN/CLOSED. This is deterministic business logic; nothing here
// is decided by Jarvis or a model.

export type StockInquiryState =
  | 'RECEIVED'
  | 'NEEDS_QUANTITY'
  | 'READY_FOR_VENDOR_CHECK'
  | 'WAITING_FOR_VENDOR'
  | 'VENDOR_CLOSED'
  | 'VENDOR_AVAILABLE'
  | 'VENDOR_OUT_OF_STOCK'
  | 'CHECKING_VARINDO_STOCK'
  | 'VARINDO_AVAILABLE'
  | 'VARINDO_OUT_OF_STOCK'
  | 'NEEDS_HUMAN'
  | 'RESPONSE_READY'
  | 'CLOSED'
  | 'CANCELLED'
  | 'FAILED';

// The one rule this table exists to enforce structurally: CHECKING_VARINDO_STOCK
// is only reachable from VENDOR_OUT_OF_STOCK — never from VENDOR_CLOSED, never
// from WAITING_FOR_VENDOR (no response), never directly from RECEIVED.
const ALLOWED_TRANSITIONS: Record<StockInquiryState, StockInquiryState[]> = {
  RECEIVED: ['NEEDS_QUANTITY', 'READY_FOR_VENDOR_CHECK', 'CANCELLED', 'FAILED'],
  NEEDS_QUANTITY: ['READY_FOR_VENDOR_CHECK', 'CANCELLED', 'FAILED'],
  READY_FOR_VENDOR_CHECK: ['WAITING_FOR_VENDOR', 'VENDOR_CLOSED', 'NEEDS_HUMAN', 'FAILED'],
  WAITING_FOR_VENDOR: ['VENDOR_AVAILABLE', 'VENDOR_OUT_OF_STOCK', 'NEEDS_HUMAN', 'FAILED'],
  VENDOR_CLOSED: ['READY_FOR_VENDOR_CHECK', 'WAITING_FOR_VENDOR', 'CANCELLED'],
  VENDOR_AVAILABLE: ['RESPONSE_READY', 'NEEDS_HUMAN'],
  VENDOR_OUT_OF_STOCK: ['CHECKING_VARINDO_STOCK', 'NEEDS_HUMAN'],
  CHECKING_VARINDO_STOCK: ['VARINDO_AVAILABLE', 'VARINDO_OUT_OF_STOCK', 'NEEDS_HUMAN', 'FAILED'],
  VARINDO_AVAILABLE: ['RESPONSE_READY', 'NEEDS_HUMAN'],
  VARINDO_OUT_OF_STOCK: ['RESPONSE_READY', 'NEEDS_HUMAN'],
  NEEDS_HUMAN: ['READY_FOR_VENDOR_CHECK', 'WAITING_FOR_VENDOR', 'RESPONSE_READY', 'CANCELLED', 'CLOSED'],
  RESPONSE_READY: ['CLOSED', 'NEEDS_HUMAN'],
  CLOSED: [],
  CANCELLED: [],
  FAILED: ['NEEDS_HUMAN', 'CANCELLED'],
};

export class InvalidStockTransitionError extends Error {
  constructor(from: StockInquiryState, to: StockInquiryState) {
    super(`Invalid stock inquiry transition: ${from} -> ${to}`);
    this.name = 'InvalidStockTransitionError';
  }
}

export function canTransition(from: StockInquiryState, to: StockInquiryState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws on an invalid move — the state machine is the enforcement point, not a suggestion. */
export function assertTransition(from: StockInquiryState, to: StockInquiryState): void {
  if (!canTransition(from, to)) throw new InvalidStockTransitionError(from, to);
}

export const TERMINAL_STATES: ReadonlySet<StockInquiryState> = new Set(['CLOSED', 'CANCELLED']);
export function isTerminal(state: StockInquiryState): boolean {
  return TERMINAL_STATES.has(state);
}
