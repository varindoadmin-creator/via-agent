import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFulfillmentAssessment } from './fulfillment.ts';

test('calculates immediate fulfilment from available system stock', () => {
  const result = calculateFulfillmentAssessment({
    requestedQuantity: 30,
    availableSystemStock: 35,
    openPurchaseOrderQuantity: 0,
    poCoverageComplete: true,
  });
  assert.equal(result.can_fulfil_from_system_stock, true);
  assert.equal(result.immediate_system_shortfall, 0);
  assert.equal(result.projected_shortfall_after_open_pos, 0);
});

test('calculates deterministic shortfall after open PO coverage', () => {
  const result = calculateFulfillmentAssessment({
    requestedQuantity: 30,
    availableSystemStock: 8,
    openPurchaseOrderQuantity: 12,
    poCoverageComplete: false,
  });
  assert.equal(result.immediate_system_shortfall, 22);
  assert.equal(result.projected_shortfall_after_open_pos, 10);
  assert.equal(result.can_cover_after_open_pos, false);
  assert.equal(result.confidence, 'limited');
});
