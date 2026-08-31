// ─── Operational finding types ────────────────────────────────────────────────
// VIA Customer Operations Phase 10, brief section 3-4: the OperationalFinding
// shape adapted to this codebase's actual conventions (VIA has no per-user
// directory, so "assigned user" is "assigned role", same as Phase 8's
// wati_conversation_state; Decimal is just `number` here, matching every
// other analytics module).

export type FindingCategory =
  | 'CUSTOMER_SERVICE' | 'STOCK' | 'VENDOR' | 'PRODUCT' | 'PRICING' | 'SALES' | 'CONVERSION'
  | 'CUSTOMER_ONBOARDING' | 'ORDER_PROCESSING' | 'PAYMENT_SERVICE' | 'SYSTEM_RELIABILITY'
  | 'DATA_QUALITY' | 'COMMERCIAL_OPPORTUNITY';

export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FindingStatus =
  | 'OPEN' | 'ACKNOWLEDGED' | 'ACTION_PLANNED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED' | 'EXPIRED';

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type BaselineType =
  | 'PREVIOUS_PERIOD' | 'TRAILING_7_DAY_AVERAGE' | 'TRAILING_30_DAY_AVERAGE' | 'CONFIGURED_TARGET' | 'SLA_TARGET';

export type DismissalReason =
  | 'KNOWN_ISSUE' | 'NOT_MATERIAL' | 'FALSE_POSITIVE' | 'EXPECTED_BUSINESS_PATTERN' | 'ALREADY_ADDRESSED' | 'OTHER';

// Brief section 51's controlled taxonomy — Jarvis picks from this list, never free text.
export type RecommendedActionType =
  | 'REVIEW_VENDOR_PROCESS' | 'ESCALATE_PENDING_CASES' | 'FIX_PRICE_SOURCE' | 'UPDATE_WEBSITE_PRICE'
  | 'CLEAN_CUSTOMER_MAPPING' | 'IMPROVE_PRODUCT_METADATA' | 'REVIEW_STOCKING_STRATEGY' | 'ADJUST_SLA_RULE'
  | 'REVIEW_STAFFING' | 'INVESTIGATE_SYSTEM_FAILURE' | 'FOLLOW_UP_COMMERCIAL_LEADS';

export interface FindingEvidence {
  metricKey: string;
  label: string;
  currentValue: number;
  baselineValue?: number | null;
  comparisonPeriod?: string;
  sampleSize?: number;
  sourceFreshness?: string;
}

/** What a detection rule produces on each pass — the store turns this into a persisted, deduplicated OperationalFinding. */
export interface FindingCandidate {
  category: FindingCategory;
  type: string;
  title: string;
  dedupeKey: string;

  metricKey?: string;
  entityType?: string;
  entityId?: string;

  periodStart?: string;
  periodEnd?: string;

  currentValue?: number;
  baselineValue?: number | null;
  baselineType?: BaselineType;
  absoluteChange?: number;
  percentChange?: number | null;

  evidence: FindingEvidence[];

  confidence: Confidence;
  sampleSize: number;

  // Deterministic severity/urgency inputs (brief section 37/39) — the engine
  // scores these, the rule never assigns severity/urgency itself.
  magnitude: number; // 0-1, how far past the alerting threshold
  affectedCount: number;
  slaRisk: boolean;

  recommendedActionType?: RecommendedActionType;
  recommendationText?: string;
  assignedTeam?: 'CUSTOMER_SERVICE' | 'SALES' | 'FINANCE' | 'OPERATIONS' | 'MANAGEMENT';

  ruleVersion: number;
}

export interface OperationalFinding {
  id: string;
  organizationId: string;

  category: FindingCategory;
  type: string;

  severity: Severity;
  urgency: Severity;
  status: FindingStatus;

  title: string;

  metricKey: string | null;
  entityType: string | null;
  entityId: string | null;

  detectedAt: string;
  periodStart: string | null;
  periodEnd: string | null;

  currentValue: number | null;
  baselineValue: number | null;
  baselineType: BaselineType | null;
  absoluteChange: number | null;
  percentChange: number | null;
  resolvedValue: number | null;

  evidence: FindingEvidence[];

  confidence: Confidence;

  recommendedActionType: RecommendedActionType | null;
  recommendationText: string | null;

  assignedRole: 'admin' | 'director' | null;
  assignedTeam: 'CUSTOMER_SERVICE' | 'SALES' | 'FINANCE' | 'OPERATIONS' | 'MANAGEMENT' | null;

  dueAt: string | null;

  dedupeKey: string;
  ruleVersion: number;

  consecutiveBreachCount: number;
  consecutiveNormalCount: number;
  recurrenceCount: number;
  lastAlertedAt: string | null;

  dismissalReason: DismissalReason | null;

  version: number;

  createdAt: string;
  updatedAt: string;
}
