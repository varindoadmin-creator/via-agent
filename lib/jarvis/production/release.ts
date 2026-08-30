import { getJarvisRuntimeConfig } from './config';

export interface JarvisReleaseRecord {
  releaseId: string;
  environment: string;
  versions: Record<string, string>;
  featureFlags: Record<string, boolean>;
  generatedAt: string;
}

function version(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

/** Safe release metadata. It deliberately contains no secrets or business data. */
export function getJarvisReleaseRecord(): JarvisReleaseRecord {
  const runtime = getJarvisRuntimeConfig();
  return {
    releaseId: runtime.releaseId,
    environment: runtime.appEnv,
    versions: {
      prompt: version('JARVIS_PROMPT_VERSION', 'jarvis-core-v1'),
      model: version('JARVIS_MODEL_VERSION', process.env.OPENAI_MODEL || 'provider-default'),
      tools: version('JARVIS_TOOL_REGISTRY_VERSION', 'tools-v1'),
      context: version('JARVIS_CONTEXT_VERSION', 'context-v1'),
      memory: version('JARVIS_MEMORY_POLICY_VERSION', 'memory-v1'),
      knowledge: version('JARVIS_KNOWLEDGE_VERSION', 'knowledge-v1'),
      workflows: version('JARVIS_WORKFLOW_VERSION', 'workflow-v1'),
      metrics: version('JARVIS_METRICS_VERSION', 'metrics-v1'),
      evaluations: version('JARVIS_EVALUATION_VERSION', 'eval-v1'),
    },
    featureFlags: {
      writes: runtime.writesAllowed,
      feedbackSchema: runtime.feedbackSchemaEnabled,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    },
    generatedAt: new Date().toISOString(),
  };
}
