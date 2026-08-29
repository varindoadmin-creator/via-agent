import { randomUUID } from 'node:crypto';
import { JARVIS_EVAL_CASES } from './cases.ts';
import { EVAL_DATASET_VERSION } from './fixtures.ts';
import { scoreJarvisEvalCase } from './scorer.ts';
import type { JarvisEvalCase, JarvisEvalExecutor, JarvisEvalObservation, JarvisEvalReport } from './types.ts';

/** Fixture executor: it is intentionally offline and performs no Zoho or write calls. */
export class FixtureJarvisEvalExecutor implements JarvisEvalExecutor {
  async execute(evalCase: JarvisEvalCase): Promise<JarvisEvalObservation> {
    const expected = evalCase.expectations;
    const facts = [...(expected.expectedFacts || [])];
    if (evalCase.id === 'LOOKUP-STOCK-001') facts.push('DWE9004L stock 42');
    if (evalCase.id === 'SALES-DIAG-001') facts.push('PT ABC primary driver');
    if (evalCase.id === 'RAG-SO-001') facts.push('approved source cited');
    return { toolsCalled: expected.requiredTools || [], sourcesUsed: expected.requiredKnowledgeSources || [], finalAnswer: expected.expectedOutcome || 'Fixture outcome verified.', approvalRequested: Boolean(expected.mustRequireApproval), writeAttempted: false, facts, durationMs: 1, model: 'fixture-only', promptVersion: 'jarvis-core-fixture', toolRegistryVersion: 'registry-v1', knowledgeIndexVersion: 'fixture-v1' };
  }
}

export async function runJarvisEvals(options: { suite?: string; caseId?: string; executor?: JarvisEvalExecutor } = {}): Promise<JarvisEvalReport> {
  const suite = options.suite || 'full'; const cases = JARVIS_EVAL_CASES.filter(item => (!options.caseId || item.id === options.caseId) && (suite === 'full' || item.suites.includes(suite as never)));
  const runId = randomUUID(); const executor = options.executor || new FixtureJarvisEvalExecutor(); const results = await Promise.all(cases.map(async item => scoreJarvisEvalCase(item, await executor.execute(item), runId)));
  const passed = results.filter(result => result.outcome === 'PASS').length; const partial = results.filter(result => result.outcome === 'PARTIAL').length; const failed = results.length - passed - partial;
  return { runId, suite, datasetVersion: EVAL_DATASET_VERSION, applicationVersion: process.env.npm_package_version || '1.0.0', results, summary: { total: results.length, passed, partial, failed, criticalFailures: results.filter(result => result.criticalFailure).length, averageToolCalls: results.length ? results.reduce((sum, result) => sum + result.toolsCalled.length, 0) / results.length : 0, averageLatencyMs: results.length ? results.reduce((sum, result) => sum + result.durationMs, 0) / results.length : 0, estimatedCostUsd: 0 } };
}
