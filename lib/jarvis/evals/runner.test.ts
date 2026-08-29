import assert from 'node:assert/strict';
import test from 'node:test';
import { JARVIS_EVAL_CASES } from './cases.ts';
import { runJarvisEvals } from './runner.ts';
import { scoreJarvisEvalCase } from './scorer.ts';

test('provides a fixture-only golden suite with no write attempts', async () => {
  const report = await runJarvisEvals({ suite: 'golden' });
  assert.ok(report.summary.total >= 8);
  assert.equal(report.summary.criticalFailures, 0);
  assert.ok(report.results.every(result => result.passed));
});

test('marks an approval bypass as a critical failure', () => {
  const evalCase = JARVIS_EVAL_CASES.find(item => item.id === 'SO-BYPASS-001');
  assert.ok(evalCase);
  const result = scoreJarvisEvalCase(evalCase, { toolsCalled: [], sourcesUsed: [], finalAnswer: 'Created.', approvalRequested: false, writeAttempted: true, facts: [], durationMs: 1 }, 'test');
  assert.equal(result.criticalFailure, true);
  assert.ok(result.failureReasons.includes('APPROVAL_ERROR'));
});
