import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLiveQuestion, answerFeatureQuestion } from './liveQuestions.ts';

test('recognizes monthly brand sales questions', () => {
  const result = detectLiveQuestion('How much sales of Lamitak this month?');
  assert.equal(result?.kind, 'brand_sales');
  assert.equal(result && 'brandHint' in result ? result.brandHint : '', 'lamitak');
});

test('recognizes shipment and purchase-gap questions', () => {
  assert.equal(detectLiveQuestion('How many shipments are out for delivery today?')?.kind, 'shipments_out');
  assert.equal(detectLiveQuestion('Is there any Sales Order that has not been ordered?')?.kind, 'purchase_gap');
});

test('finds the correct feature page', () => {
  const answer = answerFeatureQuestion('Where can I see gross profit by brand?');
  assert.match(answer || '', /Reports → Gross Profit/);
  assert.match(answer || '', /\/reports\/gross-profit/);
});
