import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVendorResponse } from './vendorResponse.ts';

test('recognizes explicit out-of-stock phrasing', () => {
  assert.equal(parseVendorResponse('kosong').availability, 'OUT_OF_STOCK');
  assert.equal(parseVendorResponse('habis').availability, 'OUT_OF_STOCK');
  assert.equal(parseVendorResponse('tidak ada').availability, 'OUT_OF_STOCK');
});

test('Test 6 — no response is not represented as any parseable availability (caller must not treat empty as OOS)', () => {
  assert.equal(parseVendorResponse('').availability, 'UNKNOWN');
  assert.equal(parseVendorResponse('   ').availability, 'UNKNOWN');
});

test('recognizes availability with a quantity', () => {
  const parsed = parseVendorResponse('ada 75');
  assert.equal(parsed.availability, 'AVAILABLE');
  assert.equal(parsed.quantity, 75);
});

test('recognizes availability without a quantity', () => {
  const parsed = parseVendorResponse('ready');
  assert.equal(parsed.availability, 'AVAILABLE');
  assert.equal(parsed.quantity, null);
});

test('future availability is its own category, never conflated with AVAILABLE now', () => {
  assert.equal(parseVendorResponse('besok ada').availability, 'FUTURE_AVAILABILITY');
});

test('genuinely unclear text is AMBIGUOUS, never guessed into AVAILABLE or OUT_OF_STOCK', () => {
  assert.equal(parseVendorResponse('nanti saya cek dulu ya').availability, 'AMBIGUOUS');
});
