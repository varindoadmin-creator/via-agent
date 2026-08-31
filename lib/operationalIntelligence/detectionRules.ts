// ─── Detection rule configuration ─────────────────────────────────────────────
// VIA Customer Operations Phase 10, brief section 87: the DetectionRule shape,
// adapted to this codebase's env-var feature-flag convention rather than a
// database-backed config table this pass (documented deferral — the shape
// below is what a future admin config UI would read/write without a
// rewrite). Ordinary conversational Jarvis never reads or alters this file
// (brief section 2003/88) — only the sweep and the admin UI's read-only
// display of current thresholds do.

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface DetectionRule {
  key: string;
  category: string;
  enabled: boolean;
  comparisonType: 'PERCENT_DECLINE' | 'PERCENT_INCREASE' | 'ABSOLUTE_THRESHOLD' | 'RATE_THRESHOLD';
  warningThreshold: number;
  highThreshold: number;
  criticalThreshold: number;
  minimumSampleSize: number;
  persistenceWindows: number;
  cooldownMinutes: number;
  ownerTeam?: 'CUSTOMER_SERVICE' | 'SALES' | 'FINANCE' | 'OPERATIONS' | 'MANAGEMENT';
}

function rule(overrides: Omit<DetectionRule, 'minimumSampleSize' | 'persistenceWindows' | 'cooldownMinutes' | 'enabled'> & { enabledEnvVar?: string; defaultPersistenceWindows?: number }): DetectionRule {
  const { enabledEnvVar, defaultPersistenceWindows, ...rest } = overrides;
  return {
    ...rest,
    // A getter, not a value computed once at module load — env vars (feature
    // flags included) must be re-read live, the same as every other flag
    // getter in this codebase (lib/customerIdentity/featureFlags.ts's flag()).
    get enabled(): boolean { return enabledEnvVar ? process.env[enabledEnvVar] === 'true' : true; },
    minimumSampleSize: envNumber(`OPERATIONAL_${rest.key}_MIN_SAMPLE`, envNumber('OPERATIONAL_MIN_SAMPLE_SIZE', 10)),
    persistenceWindows: envNumber(`OPERATIONAL_${rest.key}_PERSISTENCE`, envNumber('OPERATIONAL_PERSISTENCE_WINDOWS', defaultPersistenceWindows ?? 2)),
    cooldownMinutes: envNumber(`OPERATIONAL_${rest.key}_COOLDOWN_MINUTES`, 240),
  };
}

export const DETECTION_RULES: readonly DetectionRule[] = [
  rule({ key: 'CUSTOMER_SERVICE_SLA_DETERIORATION', category: 'CUSTOMER_SERVICE', comparisonType: 'PERCENT_DECLINE', warningThreshold: 0.05, highThreshold: 0.1, criticalThreshold: 0.2, ownerTeam: 'CUSTOMER_SERVICE' }),
  rule({ key: 'CUSTOMER_SERVICE_BACKLOG_RISK', category: 'CUSTOMER_SERVICE', comparisonType: 'ABSOLUTE_THRESHOLD', warningThreshold: 15, highThreshold: 30, criticalThreshold: 50, ownerTeam: 'CUSTOMER_SERVICE' }),
  rule({ key: 'PENDING_ACTION_AT_RISK', category: 'CUSTOMER_SERVICE', comparisonType: 'ABSOLUTE_THRESHOLD', warningThreshold: 1, highThreshold: 3, criticalThreshold: 8, ownerTeam: 'CUSTOMER_SERVICE', defaultPersistenceWindows: 1 }),
  rule({ key: 'APPROVED_TRANSACTION_NOT_EXECUTED', category: 'ORDER_PROCESSING', comparisonType: 'ABSOLUTE_THRESHOLD', warningThreshold: 1, highThreshold: 1, criticalThreshold: 5, ownerTeam: 'SALES', defaultPersistenceWindows: 1 }),
  rule({ key: 'VENDOR_RESPONSE_DETERIORATION', category: 'VENDOR', comparisonType: 'PERCENT_INCREASE', warningThreshold: 0.3, highThreshold: 0.6, criticalThreshold: 1.2, ownerTeam: 'OPERATIONS' }),
  rule({ key: 'VENDOR_OOS_DETERIORATION', category: 'VENDOR', comparisonType: 'PERCENT_INCREASE', warningThreshold: 0.3, highThreshold: 0.6, criticalThreshold: 1.2, ownerTeam: 'OPERATIONS' }),
  rule({ key: 'HIGH_DEMAND_LOW_AVAILABILITY', category: 'PRODUCT', comparisonType: 'RATE_THRESHOLD', warningThreshold: 0.2, highThreshold: 0.35, criticalThreshold: 0.5, enabledEnvVar: 'OPPORTUNITY_DETECTION_ENABLED', ownerTeam: 'OPERATIONS' }),
  rule({ key: 'CONVERSION_DECLINE', category: 'CONVERSION', comparisonType: 'PERCENT_DECLINE', warningThreshold: 0.1, highThreshold: 0.25, criticalThreshold: 0.4, ownerTeam: 'SALES' }),
  rule({ key: 'PRICING_COVERAGE_GAP', category: 'PRICING', comparisonType: 'ABSOLUTE_THRESHOLD', warningThreshold: 5, highThreshold: 10, criticalThreshold: 25, ownerTeam: 'SALES' }),
  rule({ key: 'PRICING_SOURCE_CONFLICT', category: 'PRICING', comparisonType: 'ABSOLUTE_THRESHOLD', warningThreshold: 3, highThreshold: 6, criticalThreshold: 15, ownerTeam: 'SALES' }),
  rule({ key: 'AUTOMATION_CAPABILITY_GAP', category: 'CUSTOMER_SERVICE', comparisonType: 'RATE_THRESHOLD', warningThreshold: 0.4, highThreshold: 0.6, criticalThreshold: 0.8, ownerTeam: 'CUSTOMER_SERVICE' }),
  rule({ key: 'ZOHO_WRITE_FAILURES', category: 'SYSTEM_RELIABILITY', comparisonType: 'RATE_THRESHOLD', warningThreshold: 0.1, highThreshold: 0.25, criticalThreshold: 0.5, ownerTeam: 'OPERATIONS', defaultPersistenceWindows: 1 }),
  rule({ key: 'WATI_CONTACT_SYNC_HEALTH', category: 'SYSTEM_RELIABILITY', comparisonType: 'RATE_THRESHOLD', warningThreshold: 0.15, highThreshold: 0.3, criticalThreshold: 0.5, ownerTeam: 'OPERATIONS' }),
  rule({ key: 'WORKFLOW_STUCK', category: 'SYSTEM_RELIABILITY', comparisonType: 'ABSOLUTE_THRESHOLD', warningThreshold: 1, highThreshold: 3, criticalThreshold: 10, ownerTeam: 'OPERATIONS', defaultPersistenceWindows: 1 }),
  rule({ key: 'CUSTOMER_ONBOARDING_FRICTION', category: 'CUSTOMER_ONBOARDING', comparisonType: 'RATE_THRESHOLD', warningThreshold: 0.3, highThreshold: 0.5, criticalThreshold: 0.7, ownerTeam: 'SALES' }),
  rule({ key: 'DATA_QUALITY_GAP', category: 'DATA_QUALITY', comparisonType: 'RATE_THRESHOLD', warningThreshold: 0.3, highThreshold: 0.5, criticalThreshold: 0.7, ownerTeam: 'OPERATIONS' }),
  rule({ key: 'HUMAN_HANDOFF_SPIKE', category: 'CUSTOMER_SERVICE', comparisonType: 'PERCENT_INCREASE', warningThreshold: 0.2, highThreshold: 0.4, criticalThreshold: 0.8, ownerTeam: 'CUSTOMER_SERVICE' }),
  rule({ key: 'QUOTATION_FOLLOW_UP_OPPORTUNITY', category: 'COMMERCIAL_OPPORTUNITY', comparisonType: 'ABSOLUTE_THRESHOLD', warningThreshold: 1, highThreshold: 5, criticalThreshold: 15, enabledEnvVar: 'OPPORTUNITY_DETECTION_ENABLED', ownerTeam: 'SALES' }),
];

export function getDetectionRule(key: string): DetectionRule | undefined {
  return DETECTION_RULES.find(r => r.key === key);
}

/**
 * Shared threshold evaluation for every rule (brief section 37's "magnitude"
 * severity input): `value` is always a non-negative measure of how bad
 * things are (a count, a rate, or a fractional decline/increase) —
 * `breaches` is true at or above the warning threshold, and `magnitude` is
 * normalized 0-1 between the warning and critical thresholds so severity.ts
 * can score it without knowing the rule's specific units.
 */
export function evaluateThreshold(rule: DetectionRule, value: number): { breaches: boolean; magnitude: number } {
  if (value < rule.warningThreshold) return { breaches: false, magnitude: 0 };
  const span = Math.max(rule.criticalThreshold - rule.warningThreshold, 0.0001);
  const magnitude = Math.min(1, (value - rule.warningThreshold) / span);
  return { breaches: true, magnitude };
}
