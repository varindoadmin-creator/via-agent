import assert from 'node:assert/strict';
import test from 'node:test';
import { computeCaseSlaStatus } from './sla.ts';

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) { original[key] = process.env[key]; if (vars[key] === undefined) delete process.env[key]; else process.env[key] = vars[key]; }
  try { fn(); } finally { for (const key of Object.keys(vars)) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } }
}

test('Test 85 — ON_TIME -> WARNING -> BREACHED as elapsed minutes cross the configured thresholds', () => {
  withEnv({ CS_SLA_WARNING_MINUTES: '15', CS_SLA_BREACH_MINUTES: '60', CS_SLA_PAUSE_OUTSIDE_HOURS: undefined }, () => {
    const start = new Date('2026-01-05T08:00:00Z'); // a Monday
    assert.equal(computeCaseSlaStatus(start, new Date('2026-01-05T08:05:00Z')), 'ON_TIME');
    assert.equal(computeCaseSlaStatus(start, new Date('2026-01-05T08:20:00Z')), 'WARNING');
    assert.equal(computeCaseSlaStatus(start, new Date('2026-01-05T09:05:00Z')), 'BREACHED');
  });
});

test('the SLA clock runs continuously by default (not business-hours-paused)', () => {
  withEnv({ CS_SLA_WARNING_MINUTES: '15', CS_SLA_BREACH_MINUTES: '60', CS_SLA_PAUSE_OUTSIDE_HOURS: undefined }, () => {
    // Friday 23:00 Jakarta (16:00 UTC) is outside business hours, but the
    // default clock does not pause -- 90 elapsed minutes still breaches.
    const start = new Date('2026-01-09T16:00:00Z');
    assert.equal(computeCaseSlaStatus(start, new Date('2026-01-09T17:30:00Z')), 'BREACHED');
  });
});

test('Test 86 — with CS_SLA_PAUSE_OUTSIDE_HOURS=true, time outside business hours does not count toward the SLA clock', () => {
  withEnv({ CS_SLA_WARNING_MINUTES: '15', CS_SLA_BREACH_MINUTES: '60', CS_SLA_PAUSE_OUTSIDE_HOURS: 'true' }, () => {
    // Starts at 16:30 Jakarta (09:30 UTC, within 08-17 hours) with only 30
    // clock-minutes left before close; the next 60 minutes of wall-clock
    // time span the overnight close, so only ~30 minutes actually count.
    const start = new Date('2026-01-05T09:30:00Z');
    const oneHourLater = new Date('2026-01-05T10:30:00Z');
    assert.notEqual(computeCaseSlaStatus(start, oneHourLater), 'BREACHED');
  });
});
