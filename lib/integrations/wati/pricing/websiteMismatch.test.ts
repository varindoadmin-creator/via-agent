import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWebsitePriceMismatch } from './websiteMismatch.ts';

test('Test 50 — matching website price is not flagged as a mismatch', () => {
  const result = checkWebsitePriceMismatch(2_886_000, 2_886_000);
  assert.equal(result?.mismatched, false);
});

test('a stale website price is flagged, with both values recorded for internal telemetry', () => {
  const result = checkWebsitePriceMismatch(2_600_000, 2_886_000);
  assert.equal(result?.mismatched, true);
  assert.equal(result?.websiteDisplayedPrice, 2_600_000);
  assert.equal(result?.currentApprovedPrice, 2_886_000);
});

test('a small rounding difference is not treated as a real mismatch', () => {
  const result = checkWebsitePriceMismatch(2_886_002, 2_886_000);
  assert.equal(result?.mismatched, false);
});

test('no website-displayed price present returns null (nothing to compare)', () => {
  assert.equal(checkWebsitePriceMismatch(null, 2_886_000), null);
});
