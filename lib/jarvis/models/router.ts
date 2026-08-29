import type { JarvisRequestProfile } from '../orchestration';
import { getJarvisModelRegistry, jarvisRoutingConfigVersion } from './registry.ts';
import type { JarvisModelDefinition, JarvisModelRequirements, JarvisModelRoute, JarvisReasoningLevel, JarvisRoutingTier } from './types.ts';

const RANK: Record<JarvisReasoningLevel, number> = { low: 1, medium: 2, high: 3 };

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

export function createJarvisModelRequirements(profile: JarvisRequestProfile, options: { estimatedContextTokens?: number } = {}): JarvisModelRequirements {
  const isCritical = profile.riskLevel === 'WRITE';
  const complex = profile.intent === 'DIAGNOSE' || profile.intent === 'RECOMMEND' || profile.domains.length >= 3;
  const standard = profile.intent === 'ANALYZE' || profile.intent === 'COMPARE' || profile.riskLevel === 'PREPARE';
  const tier: JarvisRoutingTier = isCritical ? 'CRITICAL' : complex ? 'COMPLEX' : standard ? 'STANDARD' : 'SIMPLE';
  const reasoning: JarvisReasoningLevel = tier === 'SIMPLE' ? 'low' : tier === 'STANDARD' ? 'medium' : 'high';
  const maxOutputTokens = tier === 'SIMPLE' ? 700 : tier === 'STANDARD' ? 1_200 : tier === 'COMPLEX' ? 2_000 : 1_500;
  return {
    tier,
    reasoning,
    toolCalling: profile.needsLiveData || profile.actionRequested,
    structuredOutput: profile.actionRequested,
    minContextTokens: Math.max(8_000, options.estimatedContextTokens || 0),
    financialConfidential: profile.domains.some(domain => ['finance', 'receivables', 'sales', 'purchasing', 'analytics'].includes(domain)),
    latencyClass: tier === 'SIMPLE' ? 'FAST_INTERACTIVE' : tier === 'STANDARD' ? 'STANDARD_INTERACTIVE' : 'COMPLEX_ANALYSIS',
    maxOutputTokens: boundedNumber(process.env[`JARVIS_${tier}_MAX_OUTPUT_TOKENS`], maxOutputTokens, 128, 8_000),
    profile: { intent: profile.intent, domains: profile.domains, riskLevel: profile.riskLevel },
  };
}

export function isJarvisModelEligible(model: JarvisModelDefinition, requirements: JarvisModelRequirements): boolean {
  const capabilities = model.capabilities;
  return model.enabled
    && RANK[capabilities.reasoning] >= RANK[requirements.reasoning]
    && (!requirements.toolCalling || capabilities.toolCalling)
    && (!requirements.structuredOutput || capabilities.structuredOutput)
    && capabilities.contextTokens >= requirements.minContextTokens
    && (!requirements.financialConfidential || capabilities.approvedForFinancialData);
}

function compareModels(requirements: JarvisModelRequirements, models: JarvisModelDefinition[]): JarvisModelDefinition[] {
  const requiredRank = RANK[requirements.reasoning];
  return [...models].sort((left, right) => {
    // Prefer the least powerful eligible model. The candidate array is filtered,
    // so its positional index must not influence the result.
    const leftDistance = RANK[left.capabilities.reasoning] - requiredRank;
    const rightDistance = RANK[right.capabilities.reasoning] - requiredRank;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    const leftCost = (left.pricing?.inputPerMillionUsd || Number.MAX_SAFE_INTEGER) + (left.pricing?.outputPerMillionUsd || Number.MAX_SAFE_INTEGER);
    const rightCost = (right.pricing?.inputPerMillionUsd || Number.MAX_SAFE_INTEGER) + (right.pricing?.outputPerMillionUsd || Number.MAX_SAFE_INTEGER);
    return leftCost - rightCost || left.id.localeCompare(right.id);
  });
}

export function routeJarvisModel(profile: JarvisRequestProfile, options: { estimatedContextTokens?: number; registry?: JarvisModelDefinition[] } = {}): JarvisModelRoute {
  const requirements = createJarvisModelRequirements(profile, options);
  const registry = options.registry || getJarvisModelRegistry();
  if (process.env.JARVIS_MODEL_ROUTING_ENABLED === 'false') {
    const selected = registry[0];
    if (!selected) throw new Error('No JARVIS model is configured.');
    return {
      configVersion: jarvisRoutingConfigVersion(), selected,
      eligibleModelIds: [selected.id], fallbackModelIds: [], requirements: { ...requirements, maxOutputTokens: 4_096 },
      routingReason: 'ROUTING_DISABLED_LEGACY_MODEL', forced: false,
    };
  }
  const forced = process.env.JARVIS_FORCE_MODEL?.trim();
  const eligible = compareModels(requirements, registry.filter(model => isJarvisModelEligible(model, requirements)));
  const selected = forced ? registry.find(model => model.id === forced && isJarvisModelEligible(model, requirements)) : eligible[0];
  if (!selected) {
    throw new Error(forced
      ? `JARVIS_FORCE_MODEL is not eligible for ${requirements.tier} requirements.`
      : `No configured JARVIS model is eligible for ${requirements.tier} requirements.`);
  }
  const fallbackModelIds = eligible.filter(model => model.id !== selected.id).map(model => model.id);
  return {
    configVersion: jarvisRoutingConfigVersion(), selected,
    eligibleModelIds: eligible.map(model => model.id), fallbackModelIds,
    requirements,
    routingReason: forced ? 'FORCED_MODEL' : `${requirements.tier}_${requirements.toolCalling ? 'TOOL' : 'CHAT'}_TASK`,
    forced: Boolean(forced),
  };
}
