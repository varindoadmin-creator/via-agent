import type { JarvisRequestProfile } from '../orchestration';

export const JARVIS_ROUTING_TIERS = ['SIMPLE', 'STANDARD', 'COMPLEX', 'CRITICAL'] as const;
export type JarvisRoutingTier = typeof JARVIS_ROUTING_TIERS[number];
export type JarvisLatencyClass = 'FAST_INTERACTIVE' | 'STANDARD_INTERACTIVE' | 'COMPLEX_ANALYSIS' | 'BACKGROUND';
export type JarvisReasoningLevel = 'low' | 'medium' | 'high';

export interface JarvisModelPricing {
  /** USD per one million tokens. Undefined means cost is intentionally not estimated. */
  inputPerMillionUsd?: number;
  outputPerMillionUsd?: number;
  cachedInputPerMillionUsd?: number;
  effectiveFrom?: string;
}

export interface JarvisModelCapabilities {
  reasoning: JarvisReasoningLevel;
  toolCalling: boolean;
  structuredOutput: boolean;
  contextTokens: number;
  approvedForFinancialData: boolean;
  latencyClass: JarvisLatencyClass;
}

export interface JarvisModelDefinition {
  id: string;
  provider: 'openai';
  enabled: boolean;
  capabilities: JarvisModelCapabilities;
  pricing?: JarvisModelPricing;
}

export interface JarvisModelRequirements {
  tier: JarvisRoutingTier;
  reasoning: JarvisReasoningLevel;
  toolCalling: boolean;
  structuredOutput: boolean;
  minContextTokens: number;
  financialConfidential: boolean;
  latencyClass: JarvisLatencyClass;
  maxOutputTokens: number;
  profile: Pick<JarvisRequestProfile, 'intent' | 'domains' | 'riskLevel'>;
}

export interface JarvisModelRoute {
  configVersion: string;
  selected: JarvisModelDefinition;
  eligibleModelIds: string[];
  fallbackModelIds: string[];
  requirements: JarvisModelRequirements;
  routingReason: string;
  forced: boolean;
}

export interface JarvisUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requests: number;
  cachedInputTokens: number;
}

export interface JarvisCostEstimate {
  inputUsd?: number;
  outputUsd?: number;
  cachedInputUsd?: number;
  totalUsd?: number;
  pricingAvailable: boolean;
}
