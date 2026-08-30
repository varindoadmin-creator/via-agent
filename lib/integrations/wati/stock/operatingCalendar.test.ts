import assert from 'node:assert/strict';
import test from 'node:test';
import { isSourceOpen, nextOpeningTime } from './operatingCalendar.ts';

test('Test 7 — a Sunday inquiry to a Mon-Sat vendor is closed, and the next opening is a future timestamp', () => {
  // 2026-08-30 is a Sunday.
  const sunday = new Date('2026-08-30T10:00:00+07:00');
  assert.equal(isSourceOpen('EDL', sunday), false);
  const next = nextOpeningTime('EDL', sunday);
  assert.equal(next.getTime() > sunday.getTime(), true);
});

test('a weekday within working hours is open', () => {
  // 2026-08-31 is a Monday.
  const mondayMorning = new Date('2026-08-31T09:00:00+07:00');
  assert.equal(isSourceOpen('EDL', mondayMorning), true);
});

test('a weekday outside working hours is closed', () => {
  const mondayNight = new Date('2026-08-31T22:00:00+07:00');
  assert.equal(isSourceOpen('EDL', mondayNight), false);
});
