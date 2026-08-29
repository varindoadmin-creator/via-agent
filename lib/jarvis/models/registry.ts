import type { JarvisModelDefinition, JarvisModelPricing } from './types.ts';

const DEFAULT_MODEL = 'gpt-5-mini';

function finiteEnv(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function pricingFor(slot: string): JarvisModelPricing | undefined {
  const inputPerMillionUsd = finiteEnv(`JARVIS_MODEL_${slot}_INPUT_PER_MILLION_USD`);
  const outputPerMillionUsd = finiteEnv(`JARVIS_MODEL_${slot}_OUTPUT_PER_MILLION_USD`);
  const cachedInputPerMillionUsd = finiteEnv(`JARVIS_MODEL_${slot}_CACHED_INPUT_PER_MILLION_USD`);
  if (inputPerMillionUsd === undefined || outputPerMillionUsd === undefined) return undefined;
  return { inputPerMillionUsd, outputPerMillionUsd, cachedInputPerMillionUsd, effectiveFrom: process.env.JARVIS_MODEL_PRICING_EFFECTIVE_FROM };
}

function modelFor(slot: 'FAST' | 'STANDARD' | 'COMPLEX' | 'CRITICAL', defaults: Omit<JarvisModelDefinition, 'id' | 'pricing'>): JarvisModelDefinition {
  const legacy = process.env.JARVIS_MODEL || DEFAULT_MODEL;
  return {
    ...defaults,
    id: process.env[`JARVIS_MODEL_${slot}`] || legacy,
    enabled: process.env[`JARVIS_MODEL_${slot}_ENABLED`] !== 'false',
    capabilities: {
      ...defaults.capabilities,
      // Explicitly allow a deployment to take a model out of financial-data
      // routing while leaving it available for non-financial requests.
      approvedForFinancialData: process.env[`JARVIS_MODEL_${slot}_FINANCIAL_APPROVED`] !== 'false',
    },
    pricing: pricingFor(slot),
  };
}

/**
 * Model metadata is centralized here. Prices are opt-in configuration rather than
 * stale hard-coded business logic; set the JARVIS_MODEL_*_PER_MILLION_USD values
 * after validating current provider pricing.
 */
export function getJarvisModelRegistry(): JarvisModelDefinition[] {
  return [
    modelFor('FAST', { provider: 'openai', capabilities: { reasoning: 'low', toolCalling: true, structuredOutput: true, contextTokens: 128_000, approvedForFinancialData: true, latencyClass: 'FAST_INTERACTIVE' } }),
    modelFor('STANDARD', { provider: 'openai', capabilities: { reasoning: 'medium', toolCalling: true, structuredOutput: true, contextTokens: 128_000, approvedForFinancialData: true, latencyClass: 'STANDARD_INTERACTIVE' } }),
    modelFor('COMPLEX', { provider: 'openai', capabilities: { reasoning: 'high', toolCalling: true, structuredOutput: true, contextTokens: 128_000, approvedForFinancialData: true, latencyClass: 'COMPLEX_ANALYSIS' } }),
    modelFor('CRITICAL', { provider: 'openai', capabilities: { reasoning: 'high', toolCalling: true, structuredOutput: true, contextTokens: 128_000, approvedForFinancialData: true, latencyClass: 'COMPLEX_ANALYSIS' } }),
  ];
}

export function jarvisRoutingConfigVersion(): string {
  return process.env.JARVIS_MODEL_ROUTING_CONFIG_VERSION || 'routing-v1';
}
