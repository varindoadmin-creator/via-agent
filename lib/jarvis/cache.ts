import type { RunContext } from '@openai/agents';
import type { JarvisRunContext } from './context';

export async function cached<T>(
  runContext: RunContext<JarvisRunContext> | undefined,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const cache = runContext?.context.cache;
  if (cache?.has(key)) return cache.get(key) as T;
  const value = await loader();
  cache?.set(key, value);
  return value;
}
