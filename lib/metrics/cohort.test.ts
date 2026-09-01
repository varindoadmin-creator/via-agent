import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCohortRetentionTable, type CustomerActivityRecord } from './cohort.ts';

test('Test 29 — a cohort is grouped by first-activity month, offset 0 is always 100%', () => {
  const records: CustomerActivityRecord[] = [
    { customerId: 'a', activityMonths: ['2026-01', '2026-02'] },
    { customerId: 'b', activityMonths: ['2026-01'] },
  ];
  const table = buildCohortRetentionTable(records, 2, '2026-03');
  assert.equal(table.length, 1);
  assert.equal(table[0].cohortMonth, '2026-01');
  assert.equal(table[0].cohortSize, 2);
  assert.equal(table[0].retentionByMonthOffset[0], 1);
  assert.equal(table[0].retentionByMonthOffset[1], 0.5); // only 'a' active in Feb
});

test('an offset beyond asOfMonth is reported as null (not observable), never 0', () => {
  const records: CustomerActivityRecord[] = [{ customerId: 'a', activityMonths: ['2026-01'] }];
  const table = buildCohortRetentionTable(records, 3, '2026-01');
  assert.equal(table[0].retentionByMonthOffset[0], 1);
  assert.equal(table[0].retentionByMonthOffset[1], null);
  assert.equal(table[0].retentionByMonthOffset[2], null);
});

test('customers with no activity months are excluded rather than forming a phantom cohort', () => {
  const records: CustomerActivityRecord[] = [{ customerId: 'a', activityMonths: [] }];
  const table = buildCohortRetentionTable(records, 1, '2026-06');
  assert.equal(table.length, 0);
});
