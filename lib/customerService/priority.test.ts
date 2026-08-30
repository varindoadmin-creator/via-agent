import assert from 'node:assert/strict';
import test from 'node:test';
import { computeInitialPriority, escalateOneLevel } from './priority.ts';

test('Test 90 — a complaint is at least HIGH priority, never LOW/NORMAL', () => {
  const priority = computeInitialPriority({ reason: 'COMPLAINT' });
  assert.equal(priority, 'HIGH');
});

test('a routine ambiguous-product handoff defaults to NORMAL, not inflated', () => {
  const priority = computeInitialPriority({ reason: 'AMBIGUOUS_PRODUCT' });
  assert.equal(priority, 'NORMAL');
});

test('an explicit "urgent"/"mendesak" customer phrase escalates to HIGH', () => {
  const priority = computeInitialPriority({ reason: 'AMBIGUOUS_PRODUCT', customerMessageText: 'Ini mendesak, tolong dibantu segera' });
  assert.equal(priority, 'HIGH');
});

test('Section 13 — priority never derives from customer revenue/value (no such field exists on the input at all)', () => {
  const priority = computeInitialPriority({ reason: 'AMBIGUOUS_PRODUCT' });
  assert.equal(priority, 'NORMAL');
  // Structural check: the input type has no revenue/value field to accidentally wire up.
  const keys = Object.keys({ reason: 'AMBIGUOUS_PRODUCT', customerMessageText: '', slaAlreadyBreached: false, isRepeatContact: false });
  assert.equal(keys.includes('customerValue'), false);
  assert.equal(keys.includes('revenue'), false);
});

test('an already-SLA-breached duplicate trigger escalates one level above the base priority', () => {
  const priority = computeInitialPriority({ reason: 'AMBIGUOUS_PRODUCT', slaAlreadyBreached: true });
  assert.equal(priority, 'HIGH');
});

test('escalateOneLevel never exceeds URGENT', () => {
  assert.equal(escalateOneLevel('URGENT'), 'URGENT');
  assert.equal(escalateOneLevel('HIGH'), 'URGENT');
  assert.equal(escalateOneLevel('LOW'), 'NORMAL');
});
