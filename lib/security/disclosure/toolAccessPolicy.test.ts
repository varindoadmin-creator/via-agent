import assert from 'node:assert/strict';
import test from 'node:test';
import { getToolsForActor, isToolAllowedForActor } from './toolAccessPolicy.ts';

const INTERNAL_ONLY_TOOL = { name: 'get_company_sales' }; // no allowedActorTypes — internal-only by default
const EXTERNAL_SAFE_TOOL = { name: 'get_customer_safe_stock', allowedActorTypes: ['INTERNAL_USER', 'EXTERNAL_CUSTOMER'] as const };

test('non-negotiable criterion: a tool with no explicit allowedActorTypes is internal-only by default', () => {
  assert.equal(isToolAllowedForActor(INTERNAL_ONLY_TOOL, 'INTERNAL_USER'), true);
  assert.equal(isToolAllowedForActor(INTERNAL_ONLY_TOOL, 'EXTERNAL_CUSTOMER'), false);
});

test('a tool must explicitly opt into external exposure', () => {
  assert.equal(isToolAllowedForActor(EXTERNAL_SAFE_TOOL, 'EXTERNAL_CUSTOMER'), true);
});

test('brief section 6: internal-sales/margin/cost-shaped tools filtered out entirely for EXTERNAL_CUSTOMER', () => {
  const registry = [
    { name: 'get_company_sales' },
    { name: 'get_brand_sales' },
    { name: 'get_margin' },
    { name: 'get_supplier_cost' },
    { name: 'get_customer_safe_stock', allowedActorTypes: ['INTERNAL_USER', 'EXTERNAL_CUSTOMER'] as const },
  ];
  const externalTools = getToolsForActor('EXTERNAL_CUSTOMER', registry);
  assert.deepEqual(externalTools.map(t => t.name), ['get_customer_safe_stock']);

  const internalTools = getToolsForActor('INTERNAL_USER', registry);
  assert.equal(internalTools.length, 5);
});

test('a registry with zero customer-safe tools filters to an empty external set — today\'s actual state', () => {
  const registry = [{ name: 'get_company_sales' }, { name: 'get_margin' }, { name: 'get_supplier_cost' }, { name: 'get_exact_inventory' }];
  assert.deepEqual(getToolsForActor('EXTERNAL_CUSTOMER', registry), []);
});
