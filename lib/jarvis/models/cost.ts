import type { JarvisCostEstimate, JarvisModelDefinition, JarvisUsageMetrics } from './types.ts';

function numberOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function usageFromJarvisResult(result: { rawResponses?: Array<{ usage?: unknown }>; runContext?: { usage?: unknown } }): JarvisUsageMetrics {
  const usage = result.runContext?.usage as Record<string, unknown> | undefined;
  if (usage) return {
    inputTokens: numberOf(usage.inputTokens), outputTokens: numberOf(usage.outputTokens), totalTokens: numberOf(usage.totalTokens),
    requests: numberOf(usage.requests), cachedInputTokens: numberOf((usage.inputTokensDetails as Record<string, unknown> | undefined)?.cached_tokens),
  };
  const entries = result.rawResponses || [];
  return entries.reduce<JarvisUsageMetrics>((total, response) => {
    const item = response.usage as Record<string, unknown> | undefined;
    total.inputTokens += numberOf(item?.inputTokens); total.outputTokens += numberOf(item?.outputTokens); total.totalTokens += numberOf(item?.totalTokens);
    total.requests += 1; return total;
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, requests: 0, cachedInputTokens: 0 });
}

export function estimateJarvisCost(model: JarvisModelDefinition, usage: JarvisUsageMetrics): JarvisCostEstimate {
  const pricing = model.pricing;
  if (pricing?.inputPerMillionUsd === undefined || pricing.outputPerMillionUsd === undefined) return { pricingAvailable: false };
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const nonCachedInput = usage.inputTokens - cached;
  const inputUsd = nonCachedInput / 1_000_000 * pricing.inputPerMillionUsd;
  const cachedInputUsd = cached / 1_000_000 * (pricing.cachedInputPerMillionUsd ?? pricing.inputPerMillionUsd);
  const outputUsd = usage.outputTokens / 1_000_000 * pricing.outputPerMillionUsd;
  return { pricingAvailable: true, inputUsd, cachedInputUsd, outputUsd, totalUsd: inputUsd + cachedInputUsd + outputUsd };
}

export function jarvisCostAlert(cost: JarvisCostEstimate): 'NONE' | 'RUN_WARNING' | 'RUN_LIMIT' {
  if (cost.totalUsd === undefined) return 'NONE';
  const limit = Number(process.env.JARVIS_MAX_ESTIMATED_RUN_COST_USD);
  const warning = Number(process.env.JARVIS_WARN_ESTIMATED_RUN_COST_USD);
  if (Number.isFinite(limit) && limit >= 0 && cost.totalUsd > limit) return 'RUN_LIMIT';
  if (Number.isFinite(warning) && warning >= 0 && cost.totalUsd > warning) return 'RUN_WARNING';
  return 'NONE';
}
