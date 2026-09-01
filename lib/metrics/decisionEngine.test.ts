import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDecisionBrief } from './decisionEngine.ts';

test('Test 34 — diagnosis language is "concentrated in", never "caused by"', () => {
  const brief = buildDecisionBrief({
    facts: ['Quotation conversion dropped 6pp MoM.'],
    topDriver: { dimensionValue: 'LAMITAK', current: 40, comparison: 60, change: -20, contributionToChange: 0.8 },
    driverDimensionLabel: 'brand', driverCategory: 'VENDOR_STOCK',
    confidence: 'MEDIUM', dataLimitations: ['Two comparable periods assumed.'],
  });
  assert.match(brief.diagnosis, /concentrated in/i);
  assert.doesNotMatch(brief.diagnosis, /caused by/i);
  assert.match(brief.diagnosis, /not established as the cause/i);
});

test('a decision brief always includes at least one option with a trade-off when a driver category has a catalog entry', () => {
  const brief = buildDecisionBrief({
    facts: ['fact'], topDriver: null, driverDimensionLabel: 'customer', driverCategory: 'CUSTOMER',
    confidence: 'HIGH', dataLimitations: [],
  });
  assert.ok(brief.options.length > 0);
  for (const option of brief.options) { assert.ok(option.option.length > 0); assert.ok(option.tradeOff.length > 0); }
});

test('the recommendation always references the first option, and confidence/data limitations pass through unchanged', () => {
  const brief = buildDecisionBrief({
    facts: [], topDriver: null, driverDimensionLabel: 'product', driverCategory: 'PRODUCT',
    confidence: 'LOW', dataLimitations: ['Small sample.'],
  });
  assert.ok(brief.recommendation.startsWith(brief.options[0].option));
  assert.equal(brief.confidence, 'LOW');
  assert.deepEqual(brief.dataLimitations, ['Small sample.']);
});

test('with no meaningful top driver, the diagnosis says the change is spread broadly rather than naming a false driver', () => {
  const brief = buildDecisionBrief({ facts: [], topDriver: null, driverDimensionLabel: 'customer', driverCategory: 'OTHER', confidence: 'MEDIUM', dataLimitations: [] });
  assert.match(brief.diagnosis, /spread broadly/i);
});
