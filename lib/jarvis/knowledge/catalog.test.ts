import assert from 'node:assert/strict';
import test from 'node:test';
import { searchKnowledge } from './catalog.ts';

test('returns source-aware knowledge without mixing live facts', () => {
  const results = searchKnowledge('official customer price policy', 'varindo');
  assert.equal(results[0].id, 'varindo-pricing-policy');
  assert.match(results[0].source, /repository/);
});
