import assert from 'node:assert/strict';
import test from 'node:test';
import { attributionConfidenceFor, splitKnownAndUnknownSources } from './sourceAttribution.ts';

test('Test 96 — an UNKNOWN source is never attributed with CONFIRMED confidence', () => {
  assert.equal(attributionConfidenceFor('UNKNOWN'), 'UNKNOWN');
  assert.equal(attributionConfidenceFor(null), 'UNKNOWN');
});

test('a recognized source is CONFIRMED', () => {
  assert.equal(attributionConfidenceFor('WEBSITE'), 'CONFIRMED');
  assert.equal(attributionConfidenceFor('GOOGLE_ADS'), 'CONFIRMED');
});

test('Section 70 — UNKNOWN is split out, never ranked among known marketing sources', () => {
  const rows = [
    { source: 'WEBSITE', leads: 10, inquiries: 20, quotations: 5, orders: 2, soValue: 1000 },
    { source: 'UNKNOWN', leads: 50, inquiries: 80, quotations: 1, orders: 0, soValue: 0 },
  ];
  const { known, unknown } = splitKnownAndUnknownSources(rows);
  assert.equal(known.length, 1);
  assert.equal(known[0].source, 'WEBSITE');
  assert.equal(unknown?.source, 'UNKNOWN');
});
