import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateThreshold, getDetectionRule } from './detectionRules.ts';

test('evaluateThreshold reports no breach below the warning threshold', () => {
  const rule = getDetectionRule('CUSTOMER_SERVICE_BACKLOG_RISK')!;
  const result = evaluateThreshold(rule, rule.warningThreshold - 1);
  assert.equal(result.breaches, false);
  assert.equal(result.magnitude, 0);
});

test('evaluateThreshold normalizes magnitude to 1 at or above the critical threshold', () => {
  const rule = getDetectionRule('CUSTOMER_SERVICE_BACKLOG_RISK')!;
  const result = evaluateThreshold(rule, rule.criticalThreshold + 100);
  assert.equal(result.breaches, true);
  assert.equal(result.magnitude, 1);
});

test('evaluateThreshold interpolates magnitude between warning and critical', () => {
  const rule = getDetectionRule('CUSTOMER_SERVICE_BACKLOG_RISK')!;
  const midpoint = (rule.warningThreshold + rule.criticalThreshold) / 2;
  const result = evaluateThreshold(rule, midpoint);
  assert.equal(result.breaches, true);
  assert.ok(result.magnitude > 0.3 && result.magnitude < 0.7);
});
