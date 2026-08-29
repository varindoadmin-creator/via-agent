import assert from 'node:assert/strict';
import test from 'node:test';
import { completeJarvisOrchestration, createJarvisOrchestrationTrace, createJarvisRequestProfile } from './orchestration.ts';

test('routes a simple stock request to a live inventory lookup', () => {
  const profile = createJarvisRequestProfile('How much DWE9004L stock do we have?');
  assert.equal(profile.intent, 'LOOKUP');
  assert.equal(profile.needsLiveData, true);
  assert.equal(profile.domains.includes('inventory'), true);
});

test('routes a sales decline question as a diagnosis', () => {
  const profile = createJarvisRequestProfile('Why are sales down this month?');
  assert.equal(profile.intent, 'DIAGNOSE');
  assert.equal(profile.domains.includes('sales'), true);
  assert.equal(profile.riskLevel, 'ANALYZE');
});

test('keeps a sales order request in prepare mode', () => {
  const profile = createJarvisRequestProfile('Create an SO for ABC, 20 DWE9004L.');
  assert.equal(profile.intent, 'PREPARE_ACTION');
  assert.equal(profile.riskLevel, 'PREPARE');
});

test('records a safe limited outcome when all tools fail', () => {
  const trace = createJarvisOrchestrationTrace('run-1', 'Why are sales down?', 'test-model');
  const completed = completeJarvisOrchestration(trace, [{
    tool: 'analyze_sales_periods', category: 'analytics', risk: 'ANALYZE', role: 'director', conversationId: 'c', requestId: 'r', timestamp: new Date().toISOString(), inputSummary: { fields: ['period'] }, success: false, durationMs: 1, errorCode: 'ZOHO_UNAVAILABLE',
  }], false);
  assert.equal(completed.state, 'LIMITED');
  assert.equal(completed.outcome, 'limited_by_data_or_service');
  assert.equal(completed.errors[0].code, 'ZOHO_UNAVAILABLE');
});
