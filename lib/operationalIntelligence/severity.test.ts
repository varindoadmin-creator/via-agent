import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreSeverity, scoreUrgency } from './severity.ts';

test('Test 37 — a large, persisted, high-confidence, SLA-affecting condition scores CRITICAL/high', () => {
  const severity = scoreSeverity({ magnitude: 0.9, persisted: true, affectedCount: 30, slaRisk: true, confidence: 'HIGH' });
  assert.equal(severity, 'CRITICAL');
});

test('a single-interval spike (not yet persisted) is downgraded, never silenced entirely', () => {
  const persisted = scoreSeverity({ magnitude: 0.4, persisted: true, affectedCount: 0, slaRisk: false, confidence: 'HIGH' });
  const notPersisted = scoreSeverity({ magnitude: 0.4, persisted: false, affectedCount: 0, slaRisk: false, confidence: 'HIGH' });
  const severityOrder = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  assert.ok(severityOrder.indexOf(notPersisted) < severityOrder.indexOf(persisted));
});

test('LOW confidence never produces a stronger severity than the same condition at HIGH confidence', () => {
  const high = scoreSeverity({ magnitude: 0.5, persisted: true, affectedCount: 5, slaRisk: false, confidence: 'HIGH' });
  const low = scoreSeverity({ magnitude: 0.5, persisted: true, affectedCount: 5, slaRisk: false, confidence: 'LOW' });
  const severityOrder = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  assert.ok(severityOrder.indexOf(low) <= severityOrder.indexOf(high));
});

test('zero magnitude never produces a severity above INFO', () => {
  const severity = scoreSeverity({ magnitude: 0, persisted: true, affectedCount: 0, slaRisk: false, confidence: 'HIGH' });
  assert.equal(severity, 'INFO');
});

test('Test 39 — urgency and severity are independent: a severe but non-time-sensitive finding is not automatically urgent', () => {
  const urgency = scoreUrgency({ timeSensitive: false, severity: 'HIGH', slaRisk: false });
  assert.notEqual(urgency, 'HIGH');
});

test('a time-sensitive, SLA-at-risk finding reaches high urgency even at moderate severity', () => {
  const urgency = scoreUrgency({ timeSensitive: true, severity: 'MEDIUM', slaRisk: true });
  const severityOrder = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  assert.ok(severityOrder.indexOf(urgency) >= severityOrder.indexOf('MEDIUM'));
});
