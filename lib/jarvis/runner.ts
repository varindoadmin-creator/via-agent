import { run, setTracingDisabled } from '@openai/agents';
import { createJarvisAgent } from './agent';
import type { JarvisRunContext } from './context';
import { collectActionPreview, collectToolActivity } from './activity';
import { completeJarvisOrchestration } from './orchestration';
import { withJarvisRunSlot } from './reliability/runGuard';
import { withTimeout } from './reliability/timeout';
import { routeJarvisModel } from './models/router';
import { estimateJarvisCost, jarvisCostAlert, usageFromJarvisResult } from './models/cost';
import { recordModelUsage } from './models/usageLog';
import { isJarvisModelUsageLogEnabled } from '../customerIdentity/featureFlags.ts';

export interface JarvisHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunJarvisInput {
  message: string;
  history: JarvisHistoryMessage[];
  context: JarvisRunContext;
}

function buildConversationInput(history: JarvisHistoryMessage[], message: string): string {
  const transcript = history.slice(-20).map(entry => {
    const speaker = entry.role === 'assistant' ? 'JARVIS' : 'USER';
    return `${speaker}: ${entry.content.slice(0, 12_000)}`;
  });
  transcript.push(`USER: ${message.slice(0, 20_000)}`);
  return transcript.join('\n\n');
}

export async function runJarvis(input: RunJarvisInput) {
  setTracingDisabled(process.env.JARVIS_TRACING_ENABLED !== 'true');
  const route = routeJarvisModel(input.context.orchestration.profile, {
    estimatedContextTokens: Math.ceil((input.message.length + input.history.reduce((sum, entry) => sum + entry.content.length, 0)) / 4),
  });
  input.context.orchestration.model = route.selected.id;
  input.context.orchestration.modelRouting = {
    configVersion: route.configVersion,
    tier: route.requirements.tier,
    selectedModel: route.selected.id,
    eligibleModelIds: route.eligibleModelIds,
    fallbackModelIds: route.fallbackModelIds,
    routingReason: route.routingReason,
    forced: route.forced,
  };
  input.context.orchestration.decisions.push(`Model route: ${route.routingReason}; selected ${route.selected.id}.`);
  const startedAt = Date.now();
  const result = await withJarvisRunSlot(() => withTimeout(run(
    createJarvisAgent(input.context, { model: route.selected.id, maxOutputTokens: route.requirements.maxOutputTokens }),
    buildConversationInput(input.history, input.message),
    {
      context: input.context,
      maxTurns: Math.max(2, Math.min(12, Number(process.env.JARVIS_MAX_TURNS) || 8)),
    },
  ), Math.max(10_000, Math.min(55_000, Number(process.env.JARVIS_RUN_TIMEOUT_MS) || 48_000)), 'JARVIS run'));

  const actionPreview = collectActionPreview(result.newItems);
  const orchestration = completeJarvisOrchestration(input.context.orchestration, input.context.toolAudit, Boolean(actionPreview));
  const usage = usageFromJarvisResult(result);
  const cost = estimateJarvisCost(route.selected, usage);
  const costAlert = jarvisCostAlert(cost);
  if (costAlert !== 'NONE') orchestration.decisions.push(`Cost guardrail signal: ${costAlert}.`);
  console.info('[jarvis.run]', JSON.stringify({
    runId: orchestration.runId,
    state: orchestration.state,
    intent: orchestration.profile.intent,
    domains: orchestration.profile.domains,
    toolsCalled: orchestration.selectedTools,
    toolCallCount: input.context.toolAudit.length,
    outcome: orchestration.outcome,
    totalDurationMs: orchestration.totalDurationMs,
    model: orchestration.model,
    routingTier: route.requirements.tier,
    routingReason: route.routingReason,
    eligibleModels: route.eligibleModelIds,
    modelRequests: usage.requests,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostUsd: cost.totalUsd,
    pricingAvailable: cost.pricingAvailable,
    costAlert,
    modelLatencyMs: Date.now() - startedAt,
    errorCodes: orchestration.errors.map(error => error.code),
    memoryQueryCount: input.context.memoryObservation.queriedIds.length,
    memoryCandidateAction: input.context.memoryObservation.candidate?.action,
  }));

  if (isJarvisModelUsageLogEnabled()) {
    void recordModelUsage({
      runId: orchestration.runId, conversationId: input.context.conversationId,
      model: orchestration.model || route.selected.id, routingTier: route.requirements.tier, routingReason: route.routingReason,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens, modelRequests: usage.requests,
      pricingAvailable: cost.pricingAvailable, estimatedCostUsd: cost.totalUsd ?? null, latencyMs: Date.now() - startedAt,
    });
  }

  return {
    message: typeof result.finalOutput === 'string' && result.finalOutput.trim()
      ? result.finalOutput.trim()
      : 'I could not produce a verified answer. Please try again.',
    toolActivity: collectToolActivity(result.newItems),
    actionPreview,
    responseId: result.lastResponseId,
    toolAudit: input.context.toolAudit,
    orchestration,
    modelUsage: usage,
    modelCost: cost,
    memoryObservation: input.context.memoryObservation,
  };
}
