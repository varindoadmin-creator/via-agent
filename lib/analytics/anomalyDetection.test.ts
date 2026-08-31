import assert from 'node:assert/strict';
import test from 'node:test';
import { detectSlaBreachAnomaly, detectVendorResponseTimeAnomaly } from './anomalyDetection.ts';

test('SLA breach anomaly never fires below the minimum sample size, even at a high rate', () => {
  const result = detectSlaBreachAnomaly(0.9, 3);
  assert.equal(result, null);
});

test('SLA breach anomaly fires once the sample is large enough and the rate exceeds the threshold', () => {
  const result = detectSlaBreachAnomaly(0.5, 20);
  assert.equal(result?.type, 'SLA_BREACH_RATE_HIGH');
  assert.equal(result?.value, 0.5);
});

test('SLA breach anomaly does not fire when the breach rate is null (no data)', () => {
  const result = detectSlaBreachAnomaly(null, 20);
  assert.equal(result, null);
});

test('SLA breach anomaly does not fire below the configured threshold', () => {
  const result = detectSlaBreachAnomaly(0.1, 20);
  assert.equal(result, null);
});

test('vendor response time anomaly never fires below the minimum sample size', () => {
  const result = detectVendorResponseTimeAnomaly('VENDOR_A', 500, 3);
  assert.equal(result, null);
});

test('vendor response time anomaly fires once the sample is large enough and the median exceeds the threshold', () => {
  const result = detectVendorResponseTimeAnomaly('VENDOR_A', 200, 15);
  assert.equal(result?.type, 'VENDOR_RESPONSE_TIME_HIGH');
  assert.ok(result?.message.includes('VENDOR_A'));
});

test('thresholds are configurable via env vars', () => {
  const original = process.env.ANOMALY_SLA_BREACH_RATE_THRESHOLD;
  process.env.ANOMALY_SLA_BREACH_RATE_THRESHOLD = '0.05';
  try {
    const result = detectSlaBreachAnomaly(0.1, 20);
    assert.equal(result?.threshold, 0.05);
  } finally {
    if (original === undefined) delete process.env.ANOMALY_SLA_BREACH_RATE_THRESHOLD;
    else process.env.ANOMALY_SLA_BREACH_RATE_THRESHOLD = original;
  }
});
