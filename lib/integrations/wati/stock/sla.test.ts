import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSlaStatus } from './sla.ts';

test('fresh inquiry is ON_TIME', () => {
  const now = new Date();
  assert.equal(computeSlaStatus(now, now), 'ON_TIME');
});

test('past the warning threshold but not breach is WARNING', () => {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 45 * 60_000); // 45 min, default warning=30, breach=120
  assert.equal(computeSlaStatus(createdAt, now), 'WARNING');
});

test('past the breach threshold is BREACHED', () => {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 150 * 60_000);
  assert.equal(computeSlaStatus(createdAt, now), 'BREACHED');
});
