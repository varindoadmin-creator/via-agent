import assert from 'node:assert/strict';
import test from 'node:test';
import { JARVIS_TOOL_LABELS } from './catalog.ts';

test('JARVIS activity catalog is complete for the current tool layer', () => {
  assert.ok(Object.keys(JARVIS_TOOL_LABELS).length >= 20);
  assert.equal(JARVIS_TOOL_LABELS.prepare_sales_order, 'Sales Order preview');
  assert.equal(JARVIS_TOOL_LABELS.search_customer, 'Customer lookup');
});
