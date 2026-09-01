import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCustomerSegments, classifyCustomerSegmentsBatch, segmentCounts, defaultSegmentationThresholds, type CustomerActivityFacts } from './segmentation.ts';

const NOW = new Date('2026-06-15T00:00:00Z');

test('Test 45/12 — this module never touches Tier: it has no field, parameter, or output resembling one', () => {
  const facts: CustomerActivityFacts = { customerId: 'c1', firstOrderDate: '2026-06-01', lastOrderDate: '2026-06-10', orderCount: 1, totalOrderValue: 1000, quotationCount: 1, sampleRequestCount: 0 };
  const result = classifyCustomerSegments(facts, NOW);
  const serialized = JSON.stringify(result).toLowerCase();
  assert.ok(!serialized.includes('tier'));
});

test('a brand-new customer with one recent order is tagged NEW and RECENT_ACTIVE, not REPEAT_CUSTOMER', () => {
  const facts: CustomerActivityFacts = { customerId: 'c1', firstOrderDate: '2026-06-10', lastOrderDate: '2026-06-10', orderCount: 1, totalOrderValue: 1_000_000, quotationCount: 0, sampleRequestCount: 0 };
  const result = classifyCustomerSegments(facts, NOW);
  assert.ok(result.segments.includes('NEW'));
  assert.ok(result.segments.includes('RECENT_ACTIVE'));
  assert.ok(!result.segments.includes('REPEAT_CUSTOMER'));
});

test('a customer with 2+ orders is REPEAT_CUSTOMER', () => {
  const facts: CustomerActivityFacts = { customerId: 'c1', firstOrderDate: '2025-01-01', lastOrderDate: '2026-06-01', orderCount: 3, totalOrderValue: 5_000_000, quotationCount: 5, sampleRequestCount: 0 };
  const result = classifyCustomerSegments(facts, NOW);
  assert.ok(result.segments.includes('REPEAT_CUSTOMER'));
});

test('a customer with no order since well past the lapsed threshold is LAPSED, not RECENT_ACTIVE', () => {
  const facts: CustomerActivityFacts = { customerId: 'c1', firstOrderDate: '2024-01-01', lastOrderDate: '2024-06-01', orderCount: 2, totalOrderValue: 2_000_000, quotationCount: 0, sampleRequestCount: 0 };
  const result = classifyCustomerSegments(facts, NOW);
  assert.ok(result.segments.includes('LAPSED'));
  assert.ok(!result.segments.includes('RECENT_ACTIVE'));
});

test('a customer with only quotations and no orders is QUOTE_ONLY', () => {
  const facts: CustomerActivityFacts = { customerId: 'c1', firstOrderDate: null, lastOrderDate: null, orderCount: 0, totalOrderValue: 0, quotationCount: 2, sampleRequestCount: 0 };
  const result = classifyCustomerSegments(facts, NOW);
  assert.deepEqual(result.segments, ['QUOTE_ONLY']);
});

test('a customer with only a sample request and nothing else is SAMPLE_ONLY', () => {
  const facts: CustomerActivityFacts = { customerId: 'c1', firstOrderDate: null, lastOrderDate: null, orderCount: 0, totalOrderValue: 0, quotationCount: 0, sampleRequestCount: 1 };
  const result = classifyCustomerSegments(facts, NOW);
  assert.deepEqual(result.segments, ['SAMPLE_ONLY']);
});

test('HIGH_VALUE fires only at or above the configured threshold', () => {
  const thresholds = defaultSegmentationThresholds();
  const below: CustomerActivityFacts = { customerId: 'c1', firstOrderDate: '2025-01-01', lastOrderDate: '2026-06-01', orderCount: 2, totalOrderValue: thresholds.highValueIdr - 1, quotationCount: 0, sampleRequestCount: 0 };
  const above: CustomerActivityFacts = { ...below, totalOrderValue: thresholds.highValueIdr };
  assert.ok(!classifyCustomerSegments(below, NOW).segments.includes('HIGH_VALUE'));
  assert.ok(classifyCustomerSegments(above, NOW).segments.includes('HIGH_VALUE'));
});

test('segmentCounts tallies across a batch correctly', () => {
  const rows: CustomerActivityFacts[] = [
    { customerId: 'a', firstOrderDate: '2026-06-01', lastOrderDate: '2026-06-01', orderCount: 1, totalOrderValue: 0, quotationCount: 0, sampleRequestCount: 0 },
    { customerId: 'b', firstOrderDate: '2026-06-01', lastOrderDate: '2026-06-01', orderCount: 1, totalOrderValue: 0, quotationCount: 0, sampleRequestCount: 0 },
  ];
  const counts = segmentCounts(classifyCustomerSegmentsBatch(rows, NOW));
  assert.equal(counts.NEW, 2);
  assert.equal(counts.RECENT_ACTIVE, 2);
  assert.equal(counts.LAPSED, 0);
});
