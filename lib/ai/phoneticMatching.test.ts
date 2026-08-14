import assert from 'node:assert/strict';
import test from 'node:test';
import { fuzzyNameSimilarity, normalizeSpokenItemCodes } from './phoneticMatching.ts';

test('tolerates plausible customer-name transcription differences', () => {
  assert.ok(fuzzyNameSimilarity('PT PROFITTO INOVASI KREATIF', 'profito inovasi kreatif') > 0.9);
  assert.ok(fuzzyNameSimilarity('KISAH KREASI KAYU', 'kisa kreasi kayu') > 0.85);
  assert.ok(fuzzyNameSimilarity('INTI KREASI REKAKARYA', 'inti kreasi reka karya') > 0.9);
});

test('normalizes English spoken item-code letters and digits', () => {
  assert.equal(normalizeSpokenItemCodes('dee ex oh five three three eight dee 10 sheets'), 'DXO5338D 10 sheets');
});

test('normalizes Indonesian spoken digits in item codes', () => {
  assert.equal(normalizeSpokenItemCodes('DXO lima tiga tiga delapan dee 5 lembar'), 'DXO 5338D 5 lembar');
});
