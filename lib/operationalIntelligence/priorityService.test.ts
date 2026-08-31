import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreFindingPriority } from './priorityService.ts';
import type { OperationalFinding } from './types.ts';

function makeFinding(overrides: Partial<OperationalFinding>): OperationalFinding {
  return {
    id: 'f1', organizationId: 'varindo', category: 'CUSTOMER_SERVICE', type: 'X',
    severity: 'MEDIUM', urgency: 'MEDIUM', status: 'OPEN', title: 'x',
    metricKey: null, entityType: null, entityId: null,
    detectedAt: new Date().toISOString(), periodStart: null, periodEnd: null,
    currentValue: null, baselineValue: null, baselineType: null, absoluteChange: null, percentChange: null, resolvedValue: null,
    evidence: [], confidence: 'MEDIUM', recommendedActionType: null, recommendationText: null,
    assignedRole: null, assignedTeam: null, dueAt: null, dedupeKey: 'X', ruleVersion: 1,
    consecutiveBreachCount: 1, consecutiveNormalCount: 0, recurrenceCount: 0, dismissalReason: null, lastAlertedAt: null,
    version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('Test 40 — a CRITICAL finding always outranks a MEDIUM finding regardless of commercial value', () => {
  const critical = scoreFindingPriority(makeFinding({ severity: 'CRITICAL', urgency: 'CRITICAL' }));
  const mediumWithHighValue = scoreFindingPriority(makeFinding({
    severity: 'MEDIUM', urgency: 'LOW',
    evidence: [{ metricKey: 'stalled_quotation_value', label: 'Value', currentValue: 500_000_000 }],
  }));
  assert.ok(critical.score > mediumWithHighValue.score, 'CRITICAL must never be outranked purely by revenue');
});

test('commercial value alone is capped and cannot dominate the score', () => {
  const noValue = scoreFindingPriority(makeFinding({ severity: 'LOW', urgency: 'LOW' }));
  const hugeValue = scoreFindingPriority(makeFinding({
    severity: 'LOW', urgency: 'LOW',
    evidence: [{ metricKey: 'stalled_quotation_value', label: 'Value', currentValue: 100_000_000_000 }],
  }));
  assert.ok(hugeValue.score - noValue.score <= 10.01, 'commercial impact must be a bounded contribution, not unbounded');
});

test('an older finding scores at least as high as an otherwise-identical fresh one (age is a tie-breaker, not a dominant factor)', () => {
  const fresh = scoreFindingPriority(makeFinding({ detectedAt: new Date().toISOString() }));
  const old = scoreFindingPriority(makeFinding({ detectedAt: new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString() }));
  assert.ok(old.score >= fresh.score);
  assert.ok(old.score - fresh.score <= 5.01);
});
