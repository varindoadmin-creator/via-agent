import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStockSource } from './sourceResolver.ts';
import type { ZohoItem } from '../../../../types/zoho.ts';

const BASE: ZohoItem = { item_id: '1', name: 'x', rate: 0, status: 'active' };

test('resolves via the item\'s own vendor_name when it matches a known brand', () => {
  const result = resolveStockSource({ ...BASE, vendor_name: 'TAK PRODUCTS AND SERVICES, PT' });
  assert.equal(result.sourceId, 'LAMITAK');
  assert.equal(result.confidence, 'AUTHORITATIVE');
});

test('falls back to an already-resolved known brand when vendor_name does not map', () => {
  const result = resolveStockSource({ ...BASE, vendor_name: 'SOME OTHER VENDOR' }, 'EDL');
  assert.equal(result.sourceId, 'EDL');
  assert.equal(result.confidence, 'AUTHORITATIVE');
});

test('unmapped and unknown resolves UNRESOLVED — never guesses a vendor', () => {
  const result = resolveStockSource({ ...BASE, vendor_name: 'SOME OTHER VENDOR' });
  assert.equal(result.confidence, 'UNRESOLVED');
  assert.equal(result.sourceId, null);
});
