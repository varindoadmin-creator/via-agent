import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeResolutionTimeBottleneck, analyzeSlaBottleneck } from './bottleneck.ts';

test('Test 104 — a resolution-time bottleneck explanation references the actual dominant driver', () => {
  const current = { vendorMinutes: 200, internalMinutes: 20, customerMinutes: 30, totalMinutes: 250 };
  const previous = { vendorMinutes: 100, internalMinutes: 18, customerMinutes: 32, totalMinutes: 150 };
  const insight = analyzeResolutionTimeBottleneck(current, previous);
  assert.ok(insight);
  assert.match(insight!.fact, /increased/);
  assert.match(insight!.diagnosis, /vendor waiting/i);
  assert.match(insight!.recommendation, /vendor/i);
});

test('Test 105 — the recommendation is grounded in the observed decomposition, never an invented cause', () => {
  const current = { vendorMinutes: 20, internalMinutes: 90, customerMinutes: 10, totalMinutes: 120 };
  const previous = { vendorMinutes: 18, internalMinutes: 30, customerMinutes: 12, totalMinutes: 60 };
  const insight = analyzeResolutionTimeBottleneck(current, previous);
  assert.ok(insight);
  assert.match(insight!.diagnosis, /internal waiting/i);
  assert.match(insight!.recommendation, /internal approval|review/i);
});

test('a change below the 5% noise threshold reports no bottleneck (never manufactures a story from noise)', () => {
  const current = { vendorMinutes: 51, internalMinutes: 10, customerMinutes: 10, totalMinutes: 71 };
  const previous = { vendorMinutes: 50, internalMinutes: 10, customerMinutes: 10, totalMinutes: 70 };
  assert.equal(analyzeResolutionTimeBottleneck(current, previous), null);
});

test('Section 78/79 — a small-sample comparison is flagged LOW confidence, not overstated', () => {
  const current = { vendorMinutes: 8, internalMinutes: 0, customerMinutes: 0, totalMinutes: 8 };
  const previous = { vendorMinutes: 4, internalMinutes: 0, customerMinutes: 0, totalMinutes: 4 };
  const insight = analyzeResolutionTimeBottleneck(current, previous);
  assert.ok(insight);
  assert.equal(insight!.confidence, 'LOW');
  assert.equal(insight!.smallSample, true);
});

test('Test 104 — an SLA bottleneck references the actual before/after breach rates', () => {
  const insight = analyzeSlaBottleneck({ currentBreachRate: 0.3, previousBreachRate: 0.1, currentCaseCount: 50, previousCaseCount: 50 });
  assert.ok(insight);
  assert.match(insight!.fact, /worsened/);
  assert.match(insight!.fact, /10%/);
  assert.match(insight!.fact, /30%/);
});

test('SLA bottleneck with a small case count is LOW confidence', () => {
  const insight = analyzeSlaBottleneck({ currentBreachRate: 0.5, previousBreachRate: 0.1, currentCaseCount: 3, previousCaseCount: 2 });
  assert.ok(insight);
  assert.equal(insight!.confidence, 'LOW');
});
