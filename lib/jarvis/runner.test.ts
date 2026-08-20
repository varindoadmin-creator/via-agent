import assert from 'node:assert/strict';
import test from 'node:test';
import { collectToolActivity } from './activity.ts';

test('collectToolActivity exposes labels without tool arguments', () => {
  const activity = collectToolActivity([
    { rawItem: { type: 'function_call', name: 'search_customer', arguments: '{"query":"secret"}' } },
    { rawItem: { type: 'function_call', name: 'search_customer', arguments: '{}' } },
    { rawItem: { type: 'message', role: 'assistant' } },
  ]);

  assert.deepEqual(activity, [{ name: 'Customer lookup', status: 'completed' }]);
  assert.equal(JSON.stringify(activity).includes('secret'), false);
});
