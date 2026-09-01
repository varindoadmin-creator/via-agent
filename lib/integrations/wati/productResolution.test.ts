import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSizeVariant } from './productResolution.ts';
import type { ZohoItem } from '../../../types/zoho.ts';

// Only the paths that never reach the network (real Zoho search) are covered
// here — see docs/wati-jarvis-knowledge-test-report.md for why this codebase
// doesn't mock lib/zoho/items.ts elsewhere either.

test('already the requested size: returns the same item without a search', async () => {
  const item: ZohoItem = { item_id: '1', name: "DXO 5338D - LAMITAK HPL 4'x8' | STOFFA GRIGIO", sku: 'LAM-DXO5338D', rate: 0, status: 'active' };
  const result = await resolveSizeVariant(item, '4x8');
  assert.equal(result.status, 'EXACT');
  assert.equal(result.item, item);
});

test('no digit-count signal in the code: never guesses a candidate, never calls search', async () => {
  const item: ZohoItem = { item_id: '1', name: "NOCODE - LAMITAK HPL 4'x8' | PLAIN", sku: 'LAM-NOCODE', rate: 0, status: 'active' };
  const result = await resolveSizeVariant(item, '4x10');
  assert.equal(result.status, 'NOT_FOUND');
  assert.equal(result.item, null);
});
