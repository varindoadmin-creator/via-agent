import { JarvisReliabilityError } from './errors.ts';

let activeRuns = 0;

export function jarvisRunCapacity(): number { return Math.max(1, Math.min(20, Number(process.env.JARVIS_MAX_CONCURRENT_RUNS) || 6)); }
export async function withJarvisRunSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (activeRuns >= jarvisRunCapacity()) throw new JarvisReliabilityError('RATE_LIMIT', 'JARVIS is busy. Please retry in a moment.', { retryable: true, dependency: 'jarvis' });
  activeRuns += 1;
  try { return await operation(); } finally { activeRuns -= 1; }
}
