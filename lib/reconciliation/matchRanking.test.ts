import assert from 'node:assert/strict';
import test from 'node:test';
import { compareInvoiceMatches } from './matchRanking.ts';

test('exact single invoice ranks ahead of an equally scored combination', () => {
  const matches = [
    { type: 'multi' as const, match_score: 1 },
    { type: 'single' as const, match_score: 1, amount_score: 1 },
  ].sort(compareInvoiceMatches);

  assert.equal(matches[0].type, 'single');
});

test('a meaningfully higher score still wins', () => {
  const matches = [
    { type: 'single' as const, match_score: 0.72, amount_score: 1 },
    { type: 'multi' as const, match_score: 0.9 },
  ].sort(compareInvoiceMatches);

  assert.equal(matches[0].type, 'multi');
});

test('single invoice wins a near-tie even without an exact amount', () => {
  const matches = [
    { type: 'multi' as const, match_score: 0.9 },
    { type: 'single' as const, match_score: 0.895, amount_score: 0.99 },
  ].sort(compareInvoiceMatches);

  assert.equal(matches[0].type, 'single');
});
