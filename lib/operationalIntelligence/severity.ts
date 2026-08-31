// ─── Deterministic severity & urgency scoring ─────────────────────────────────
// VIA Customer Operations Phase 10, brief sections 37, 39: severity and
// urgency are computed from explicit numeric factors, never assigned by an
// LLM. Kept as two separate scores per brief section 39's example (a stale
// website price can be severe but not minute-by-minute urgent; a stuck
// customer reply is the reverse).

import type { Severity } from './types.ts';

export interface SeverityFactors {
  /** 0-1: how far past the alerting threshold the metric has moved. */
  magnitude: number;
  /** True once the persistence-window requirement (brief section 36) is met. */
  persisted: boolean;
  affectedCount: number;
  slaRisk: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

const SEVERITY_ORDER: Severity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function clampSeverity(index: number): Severity {
  return SEVERITY_ORDER[Math.max(0, Math.min(SEVERITY_ORDER.length - 1, index))];
}

/**
 * A transparent point score, not an opaque AI number (brief section 38): each
 * factor contributes a fixed number of severity "steps" up from INFO.
 */
export function scoreSeverity(factors: SeverityFactors): Severity {
  let steps = 0;
  if (factors.magnitude >= 0.75) steps += 3;
  else if (factors.magnitude >= 0.4) steps += 2;
  else if (factors.magnitude > 0) steps += 1;

  if (!factors.persisted) steps -= 1; // a single-interval spike is downgraded, not silenced
  if (factors.affectedCount >= 20) steps += 1;
  if (factors.slaRisk) steps += 1;
  if (factors.confidence === 'LOW') steps -= 1;

  return clampSeverity(steps);
}

export interface UrgencyFactors {
  /** True when a delay compounds every additional minute (e.g. a customer waiting for a reply). */
  timeSensitive: boolean;
  severity: Severity;
  slaRisk: boolean;
}

/**
 * Urgency is deliberately independent of severity (brief section 39):
 * severity asks "how bad", urgency asks "how soon does this need a human".
 */
export function scoreUrgency(factors: UrgencyFactors): Severity {
  const severityIndex = SEVERITY_ORDER.indexOf(factors.severity);
  let steps = factors.timeSensitive ? severityIndex : Math.max(0, severityIndex - 2);
  if (factors.slaRisk) steps += 1;
  return clampSeverity(steps);
}
