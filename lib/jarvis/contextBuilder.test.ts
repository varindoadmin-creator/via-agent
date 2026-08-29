import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJarvisContextPackage, selectRelevantConversation } from './contextBuilder.ts';
import { createJarvisRequestProfile } from './orchestration.ts';

test('keeps recent conversation within the context budget', () => {
  const selected = selectRelevantConversation(Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `message-${index}` })));
  assert.equal(selected.length, 6);
  assert.equal(selected[0].content, 'message-4');
});

test('scopes a stock lookup to inventory tools', () => {
  const context = buildJarvisContextPackage({ role: 'director', profile: createJarvisRequestProfile('How much stock do we have for DWE9004L?'), history: [] });
  assert.equal(context.availableCapabilities.includes('inventory'), true);
  assert.equal(context.availableToolNames.includes('get_item_stock'), true);
  assert.equal(context.availableToolNames.includes('search_purchase_orders'), false);
});

test('includes protected Sales Order tools only for a preparation request', () => {
  const context = buildJarvisContextPackage({ role: 'director', profile: createJarvisRequestProfile('Create an SO for ABC, 20 DWE9004L.'), history: [] });
  assert.equal(context.availableToolNames.includes('prepare_sales_order'), true);
  assert.equal(context.policies.length, 3);
});
