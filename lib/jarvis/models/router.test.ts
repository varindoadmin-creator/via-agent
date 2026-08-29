import assert from 'node:assert/strict';
import test from 'node:test';
import { createJarvisRequestProfile } from '../orchestration.ts';
import { estimateJarvisCost } from './cost.ts';
import { routeJarvisModel } from './router.ts';
import type { JarvisModelDefinition } from './types.ts';

const registry: JarvisModelDefinition[] = [
  { id: 'fast', provider: 'openai', enabled: true, capabilities: { reasoning: 'low', toolCalling: true, structuredOutput: true, contextTokens: 32_000, approvedForFinancialData: true, latencyClass: 'FAST_INTERACTIVE' }, pricing: { inputPerMillionUsd: 1, outputPerMillionUsd: 2 } },
  { id: 'standard', provider: 'openai', enabled: true, capabilities: { reasoning: 'medium', toolCalling: true, structuredOutput: true, contextTokens: 64_000, approvedForFinancialData: true, latencyClass: 'STANDARD_INTERACTIVE' }, pricing: { inputPerMillionUsd: 3, outputPerMillionUsd: 4 } },
  { id: 'complex', provider: 'openai', enabled: true, capabilities: { reasoning: 'high', toolCalling: true, structuredOutput: true, contextTokens: 128_000, approvedForFinancialData: true, latencyClass: 'COMPLEX_ANALYSIS' }, pricing: { inputPerMillionUsd: 8, outputPerMillionUsd: 12 } },
];

test('routes a simple live stock lookup to the fast eligible model', () => {
  const route = routeJarvisModel(createJarvisRequestProfile('How much DWE9004L stock do we have?'), { registry });
  assert.equal(route.requirements.tier, 'SIMPLE');
  assert.equal(route.selected.id, 'fast');
  assert.equal(route.routingReason, 'SIMPLE_TOOL_TASK');
});

test('routes comparison and cross-domain diagnosis to stronger capability tiers', () => {
  const comparison = routeJarvisModel(createJarvisRequestProfile('Compare this month sales to last month.'), { registry });
  const diagnosis = routeJarvisModel(createJarvisRequestProfile('Why are sales, margin, stock, and receivables down?'), { registry });
  assert.equal(comparison.selected.id, 'standard');
  assert.equal(diagnosis.selected.id, 'complex');
});

test('does not choose a cheaper model that lacks the required reasoning capability', () => {
  const weakRegistry = [{ ...registry[0], id: 'cheap' }, { ...registry[2], id: 'reliable' }];
  const route = routeJarvisModel(createJarvisRequestProfile('Recommend a 90-day plan for sales, margin, inventory and receivables.'), { registry: weakRegistry });
  assert.equal(route.selected.id, 'reliable');
});

test('calculates configurable input, cached input, and output costs exactly', () => {
  const estimate = estimateJarvisCost({ ...registry[0], pricing: { inputPerMillionUsd: 2, cachedInputPerMillionUsd: 0.5, outputPerMillionUsd: 8 } }, {
    inputTokens: 1_000_000, cachedInputTokens: 200_000, outputTokens: 500_000, totalTokens: 1_500_000, requests: 1,
  });
  assert.equal(estimate.pricingAvailable, true);
  assert.equal(estimate.inputUsd, 1.6);
  assert.equal(estimate.cachedInputUsd, 0.1);
  assert.equal(estimate.outputUsd, 4);
  assert.equal(estimate.totalUsd, 5.7);
});
