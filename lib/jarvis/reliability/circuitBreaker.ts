export type CircuitState = 'closed' | 'open' | 'half_open';

interface Entry { failures: number; openedAt?: number; halfOpenInFlight?: boolean; }

/** Instance-local breaker: prevents one Cloud Run instance repeatedly calling a failing dependency. */
export class CircuitBreaker {
  private readonly entries = new Map<string, Entry>();
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  constructor(threshold = 3, cooldownMs = 30_000, now = () => Date.now()) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.now = now;
  }

  state(key: string): CircuitState {
    const entry = this.entries.get(key);
    if (!entry || entry.openedAt === undefined) return 'closed';
    return this.now() - entry.openedAt >= this.cooldownMs ? 'half_open' : 'open';
  }

  allow(key: string): boolean {
    const state = this.state(key);
    if (state === 'closed') return true;
    const entry = this.entries.get(key)!;
    if (state === 'half_open' && !entry.halfOpenInFlight) { entry.halfOpenInFlight = true; return true; }
    return false;
  }

  succeed(key: string): void { this.entries.delete(key); }
  fail(key: string): void {
    const entry = this.entries.get(key) || { failures: 0 };
    entry.failures += 1;
    entry.halfOpenInFlight = false;
    if (entry.failures >= this.threshold) entry.openedAt = this.now();
    this.entries.set(key, entry);
  }
}

export const jarvisCircuitBreaker = new CircuitBreaker();
