import assert from 'node:assert/strict';
import test from 'node:test';
import { collectActionPreview, collectToolActivity } from './activity.ts';

test('collectToolActivity exposes labels without tool arguments', () => {
  const activity = collectToolActivity([
    { rawItem: { type: 'function_call', name: 'search_customer', arguments: '{"query":"secret"}' } },
    { rawItem: { type: 'function_call', name: 'search_customer', arguments: '{}' } },
    { rawItem: { type: 'message', role: 'assistant' } },
  ]);

  assert.deepEqual(activity, [{ name: 'Customer lookup', status: 'completed' }]);
  assert.equal(JSON.stringify(activity).includes('secret'), false);
});

test('collectActionPreview returns only a structured persisted preview', () => {
  const preview = collectActionPreview([{
    type: 'tool_call_output_item',
    output: JSON.stringify({ kind: 'jarvis_so_preview', approval_id: 'approval-1', preview: { customer_id: 'customer-1' } }),
  }]);
  assert.equal(preview?.approval_id, 'approval-1');
  assert.deepEqual(preview?.preview, { customer_id: 'customer-1' });
});
