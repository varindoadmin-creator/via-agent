export const JARVIS_APP_ENVS = ['development', 'test', 'staging', 'production'] as const;
export type JarvisAppEnv = typeof JARVIS_APP_ENVS[number];

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function detectAppEnv(): JarvisAppEnv {
  const configured = envValue('APP_ENV');
  if (configured && (JARVIS_APP_ENVS as readonly string[]).includes(configured)) return configured as JarvisAppEnv;
  return process.env.NODE_ENV === 'production' ? 'production' : 'development';
}

export interface JarvisRuntimeConfig {
  appEnv: JarvisAppEnv;
  releaseId: string;
  feedbackSchemaEnabled: boolean;
  writesAllowed: boolean;
  issues: string[];
}

/** Central non-secret runtime configuration. Non-production can never enable writes. */
export function getJarvisRuntimeConfig(): JarvisRuntimeConfig {
  const appEnv = detectAppEnv();
  const issues: string[] = [];
  if (appEnv !== 'production' && process.env.JARVIS_WRITES_ENABLED === 'true') issues.push('JARVIS_WRITES_ENABLED is ignored outside production.');
  return {
    appEnv,
    releaseId: envValue('JARVIS_RELEASE_ID') || envValue('K_REVISION') || envValue('GIT_COMMIT') || 'local-unversioned',
    feedbackSchemaEnabled: process.env.JARVIS_FEEDBACK_SCHEMA_ENABLED === 'true',
    writesAllowed: appEnv === 'production' && process.env.JARVIS_WRITES_ENABLED === 'true',
    issues,
  };
}
