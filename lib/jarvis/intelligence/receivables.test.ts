import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeReceivables } from './receivables.ts';

test('places receivables into deterministic aging buckets', () => {
  const result = summarizeReceivables([
    { balance: 100, dueDate: '2026-08-20', customerName: 'A' },
    { balance: 200, dueDate: '2026-08-01', customerName: 'B' },
    { balance: 300, dueDate: '2026-05-01', customerName: 'A' },
  ], '2026-08-20');
  assert.equal(result.total_outstanding, 600);
  assert.equal(result.buckets.current, 100);
  assert.equal(result.buckets.days_1_30, 200);
  assert.equal(result.buckets.over_90, 300);
  assert.equal(result.top_customers[0].name, 'A');
});
