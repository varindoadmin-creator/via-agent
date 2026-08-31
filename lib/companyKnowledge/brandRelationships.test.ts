import assert from 'node:assert/strict';
import test from 'node:test';
import { getBrandRelationship } from './brandRelationships.ts';

test('Test 81 — EDL dealer status is the exact approved wording', () => {
  assert.equal(getBrandRelationship('EDL').dealerStatement, 'Varindo is an Authorized Dealer of EDL in Indonesia.');
  assert.equal(getBrandRelationship('EDL').website, 'varindohpl.com');
});

test('Test 82 — Lamitak dealer status is the exact approved wording', () => {
  assert.equal(getBrandRelationship('LAMITAK').dealerStatement, 'Varindo is an Authorized Dealer of Lamitak.');
  assert.equal(getBrandRelationship('LAMITAK').website, 'varindo.co.id');
});

test('neither statement is ever upgraded to exclusive/sole/master distributor wording', () => {
  const edl = getBrandRelationship('EDL').dealerStatement;
  const lamitak = getBrandRelationship('LAMITAK').dealerStatement;
  for (const forbidden of ['exclusive', 'sole', 'master']) {
    assert.doesNotMatch(edl.toLowerCase(), new RegExp(forbidden));
    assert.doesNotMatch(lamitak.toLowerCase(), new RegExp(forbidden));
  }
});
