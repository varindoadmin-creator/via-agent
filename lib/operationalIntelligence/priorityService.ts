// ─── Operational priority service ─────────────────────────────────────────────
// VIA Customer Operations Phase 10, brief section 40: a transparent, documented
// weighted score — never an opaque AI ranking, and never ranked solely by
// revenue (brief's explicit instruction).

import { listFindings, type ListFindingsFilters } from './findingStore.ts';
import type { OperationalFinding, Severity } from './types.ts';

const SEVERITY_WEIGHT: Record<Severity, number> = { INFO: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const CONFIDENCE_WEIGHT: Record<OperationalFinding['confidence'], number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export interface PriorityScoreBreakdown {
  finding: OperationalFinding;
  score: number;
  factors: { severity: number; urgency: number; confidence: number; affectedCount: number; commercialImpact: number; age: number };
}

/**
 * A documented formula (brief section 38): severity and urgency dominate,
 * confidence and affected-count are secondary, age is a small tie-breaker so
 * an old MEDIUM does not silently outrank a fresh CRITICAL. Commercial value
 * (evidence values in IDR) contributes only a bounded, capped amount — never
 * enough alone to outrank a more severe customer-facing issue.
 */
export function scoreFindingPriority(finding: OperationalFinding): PriorityScoreBreakdown {
  const severity = SEVERITY_WEIGHT[finding.severity] * 20;
  const urgency = SEVERITY_WEIGHT[finding.urgency] * 15;
  const confidence = CONFIDENCE_WEIGHT[finding.confidence] * 5;
  const affectedCount = Math.min(10, (finding.evidence.find(e => e.sampleSize)?.sampleSize ?? 0) / 5);
  const commercialValue = finding.evidence.find(e => e.metricKey.toLowerCase().includes('value'))?.currentValue ?? 0;
  const commercialImpact = Math.min(10, commercialValue / 10_000_000); // capped at 10 points regardless of size
  const ageHours = (Date.now() - new Date(finding.detectedAt).getTime()) / 3_600_000;
  const age = Math.min(5, ageHours / 24);

  const score = severity + urgency + confidence + affectedCount + commercialImpact + age;
  return { finding, score, factors: { severity, urgency, confidence, affectedCount, commercialImpact, age } };
}

export async function rankOpenFindings(filters: ListFindingsFilters = {}): Promise<PriorityScoreBreakdown[]> {
  const findings = await listFindings({ status: ['OPEN', 'ACKNOWLEDGED', 'ACTION_PLANNED', 'IN_PROGRESS'], ...filters });
  return findings.map(scoreFindingPriority).sort((a, b) => b.score - a.score);
}
