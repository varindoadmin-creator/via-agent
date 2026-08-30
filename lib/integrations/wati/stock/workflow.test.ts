import assert from 'node:assert/strict';
import test from 'node:test';
import { canTransition, assertTransition, InvalidStockTransitionError, isTerminal } from './workflow.ts';

test('CHECKING_VARINDO_STOCK is only reachable from VENDOR_OUT_OF_STOCK — the structural enforcement of Rule 5', () => {
  assert.equal(canTransition('VENDOR_OUT_OF_STOCK', 'CHECKING_VARINDO_STOCK'), true);
  assert.equal(canTransition('VENDOR_CLOSED', 'CHECKING_VARINDO_STOCK'), false);
  assert.equal(canTransition('WAITING_FOR_VENDOR', 'CHECKING_VARINDO_STOCK'), false);
  assert.equal(canTransition('RECEIVED', 'CHECKING_VARINDO_STOCK'), false);
  assert.equal(canTransition('NEEDS_HUMAN', 'CHECKING_VARINDO_STOCK'), false);
});

test('vendor-closed and no-response never transition directly to a fallback or a final result', () => {
  // VENDOR_CLOSED can only go back into the vendor-check flow, or be cancelled.
  assert.equal(canTransition('VENDOR_CLOSED', 'RESPONSE_READY'), false);
  assert.equal(canTransition('VENDOR_CLOSED', 'CHECKING_VARINDO_STOCK'), false);
  // WAITING_FOR_VENDOR (no response yet) cannot jump straight to a result either.
  assert.equal(canTransition('WAITING_FOR_VENDOR', 'RESPONSE_READY'), false);
});

test('rejects an invalid transition instead of silently allowing it', () => {
  assert.throws(() => assertTransition('RECEIVED', 'CLOSED'), InvalidStockTransitionError);
  assert.doesNotThrow(() => assertTransition('RECEIVED', 'READY_FOR_VENDOR_CHECK'));
});

test('CLOSED and CANCELLED are terminal', () => {
  assert.equal(isTerminal('CLOSED'), true);
  assert.equal(isTerminal('CANCELLED'), true);
  assert.equal(isTerminal('WAITING_FOR_VENDOR'), false);
});
