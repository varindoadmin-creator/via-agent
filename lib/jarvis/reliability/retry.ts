import { classifyJarvisFailure } from './errors.ts';

export interface ReliableRetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Only use for idempotent reads or mutations protected by a durable idempotency key. */
export async function retryTransient<T>(operation: () => Promise<T>, options: ReliableRetryOptions = {}): Promise<T> {
  const retries = Math.max(0, Math.min(3, options.retries ?? 2));
  const base = Math.max(10, options.baseDelayMs ?? 300);
  const max = Math.max(base, options.maxDelayMs ?? 3_000);
  const sleep = options.sleep ?? pause;
  const random = options.random ?? Math.random;
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      const failure = classifyJarvisFailure(error);
      if (!failure.retryable || attempt >= retries) throw failure;
      const exponential = Math.min(max, base * 2 ** attempt);
      await sleep(Math.round(exponential * (0.5 + random())));
    }
  }
}
