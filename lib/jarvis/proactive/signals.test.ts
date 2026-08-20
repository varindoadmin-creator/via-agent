import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateExecutiveSignals } from './signals.ts';

test('creates evidence-only proactive signals without executing actions', () => {
  const signals = evaluateExecutiveSignals({ revenueGrowth: -0.12, overdueShare: 0.5 });
  assert.deepEqual(signals.map(signal => signal.code), ['sales_decline', 'receivables_risk']);
  assert.equal('execute' in signals[0], false);
});
