// ─── Proactive customer action types ──────────────────────────────────────────
// VIA Customer Operations Phase 11: the ProactiveCustomerAction shape from the
// brief, adapted to this codebase's real conventions the same way Phase 10's
// OperationalFinding was — "assigned user" is "assigned role" (VIA has no
// per-user directory), team is the fixed ServiceTeam enum already used by
// Phase 8 handoff routing.

export type ProactiveActionType =
  | 'QUOTATION_FOLLOW_UP'
  | 'ORDER_INTENT_FOLLOW_UP'
  | 'REORDER_OPPORTUNITY'
  | 'SAMPLE_REQUEST_FOLLOW_UP'
  | 'CUSTOMER_CALLBACK'
  | 'NEEDS_INFORMATION_FOLLOW_UP'
  | 'INACTIVE_COMMERCIAL_DRAFT'
  | 'SERVICE_RECOVERY'
  | 'APPROVED_CAMPAIGN_OUTREACH'
  | 'DORMANT_CUSTOMER_REENGAGEMENT';

export type ProactiveActionStatus =
  | 'DETECTED' | 'REVIEW_REQUIRED' | 'APPROVED' | 'SCHEDULED' | 'SENT' | 'CUSTOMER_RESPONDED'
  | 'CONVERTED' | 'DISMISSED' | 'EXPIRED' | 'FAILED' | 'CANCELLED';

export type ProactiveActionChannel = 'WHATSAPP' | 'INTERNAL_TASK';

/** Section 13's message-category taxonomy — the input to eligibility/consent policy, never inferred at send time. */
export type MessageCategory = 'SERVICE_MESSAGE' | 'TRANSACTIONAL_MESSAGE' | 'SALES_FOLLOW_UP' | 'MARKETING_MESSAGE';

/** Section 30's three outbound approval levels. */
export type OutboundApprovalLevel = 'AUTO_ALLOWED' | 'REQUIRES_REVIEW' | 'PROHIBITED';

/** Section 19: bounded cadence — never a third stage, never an infinite loop. */
export type FollowUpStage = 'INITIAL_FOLLOW_UP' | 'FINAL_FOLLOW_UP';

export type ProactivePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type ServiceTeam = 'CUSTOMER_SERVICE' | 'SALES' | 'FINANCE' | 'OPERATIONS' | 'MANAGEMENT';

export type DismissalReason =
  | 'ALREADY_HANDLED' | 'CUSTOMER_DECLINED' | 'NOT_RELEVANT' | 'DUPLICATE' | 'POLICY_BLOCKED' | 'OTHER';

export interface ProactiveActionEvidenceItem {
  label: string;
  value: string | number;
}

const NON_TERMINAL_STATUSES: ProactiveActionStatus[] = ['DETECTED', 'REVIEW_REQUIRED', 'APPROVED', 'SCHEDULED', 'SENT'];
const TERMINAL_STATUSES: ProactiveActionStatus[] = ['CONVERTED', 'DISMISSED', 'EXPIRED', 'FAILED', 'CANCELLED'];
const IN_FLIGHT_STATUSES: ProactiveActionStatus[] = ['APPROVED', 'SCHEDULED', 'SENT', 'CUSTOMER_RESPONDED'];

export function isNonTerminalStatus(status: ProactiveActionStatus): boolean {
  return NON_TERMINAL_STATUSES.includes(status) || status === 'CUSTOMER_RESPONDED';
}
export function isTerminalStatus(status: ProactiveActionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
export function isInFlightStatus(status: ProactiveActionStatus): boolean {
  return IN_FLIGHT_STATUSES.includes(status);
}

/** What a detector produces on each pass — the store turns this into a persisted, deduplicated ProactiveCustomerAction (mirrors operationalIntelligence's FindingCandidate -> OperationalFinding split). */
export interface ProactiveActionCandidate {
  type: ProactiveActionType;

  customerId?: string | null;
  customerPhoneNormalized?: string | null;
  conversationId?: string | null;
  quotationId?: string | null;
  salesOrderId?: string | null;
  commercialDraftId?: string | null;
  sampleRequestId?: string | null;
  productId?: string | null;

  reason: string;
  evidence: ProactiveActionEvidenceItem[];

  recommendedAction: string;
  channel: ProactiveActionChannel;
  messageCategory?: MessageCategory;

  priority: ProactivePriority;
  dueAt?: string | null;

  assignedTeam?: ServiceTeam;
  followUpStage?: FollowUpStage;

  potentialValue?: number | null;
  potentialValueLabel?: string | null;

  dedupeKey: string;
}

export interface ProactiveCustomerAction {
  id: string;
  organizationId: string;

  type: ProactiveActionType;

  customerId: string | null;
  customerPhoneNormalized: string | null;
  conversationId: string | null;
  quotationId: string | null;
  salesOrderId: string | null;
  commercialDraftId: string | null;
  sampleRequestId: string | null;
  productId: string | null;

  reason: string;
  evidence: ProactiveActionEvidenceItem[];

  recommendedAction: string;
  channel: ProactiveActionChannel;
  messageCategory: MessageCategory | null;

  status: ProactiveActionStatus;
  priority: ProactivePriority;
  dueAt: string | null;

  requiresApproval: boolean;
  approvedBy: 'admin' | 'director' | null;
  approvedAt: string | null;

  assignedRole: 'admin' | 'director' | null;
  assignedTeam: ServiceTeam | null;

  followUpStage: FollowUpStage | null;

  draftMessage: string | null;
  sentMessage: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  convertedAt: string | null;

  potentialValue: number | null;
  potentialValueLabel: string | null;

  dismissalReason: DismissalReason | null;

  dedupeKey: string;
  version: number;

  createdAt: string;
  updatedAt: string;
}
