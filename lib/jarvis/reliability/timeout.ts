import { JarvisReliabilityError } from './errors.ts';

export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, dependency: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new JarvisReliabilityError('TIMEOUT', `${dependency} timed out.`, { retryable: true, dependency })), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
