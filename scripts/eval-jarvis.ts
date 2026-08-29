import { runJarvisEvals } from '../lib/jarvis/evals/runner.ts';

const args = process.argv.slice(2); const valueFor = (name: string) => args.find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
const report = await runJarvisEvals({ suite: valueFor('--suite'), caseId: valueFor('--case') });
console.log(JSON.stringify({ suite: report.suite, datasetVersion: report.datasetVersion, summary: report.summary, results: report.results.map(result => ({ caseId: result.caseId, outcome: result.outcome, criticalFailure: result.criticalFailure, tools: result.toolsCalled, failures: result.failureReasons })) }, null, 2));
if (report.summary.criticalFailures > 0 || report.summary.failed > 0) process.exitCode = 1;
