// ─── Rate limiting ─────────────────────────────────────────────────────────────
// VIA Phase 13, brief section 12: per-endpoint rate limiting for the two
// genuinely exposed surfaces that had none before this phase — the login
// endpoint (brute-force risk) and the Jarvis chat endpoint (expensive model
// calls). Deliberately in-memory and per-Cloud-Run-instance, the same
// explicitly-accepted tradeoff `JARVIS_MAX_CONCURRENT_RUNS`'s run guard
// already makes (docs/jarvis-reliability-production-engineering.md: "The
// circuit breaker and run guard are deliberately process-local... reduce
// pressure and cascading failures rather than acting as a global lock").
// A multi-instance deployment gets N independent windows, not one global
// one — acceptable for VIA's actual scale (see docs/reliability.md), and a
// real global limiter would require a shared store this codebase does not
// have (no Redis — see docs/production-architecture.md).
//
// The WATI webhook route is deliberately NOT rate-limited here — brief
// section 12's own instruction is to never rate-limit a legitimate webhook
// retry, and the webhook already has its own idempotency guard
// (wati_messages.provider_message_id) plus its own auth/size checks; adding
// a second, unrelated limiter there would only risk rejecting a legitimate
// retry for no safety benefit.

interface Bucket {
  windowStartMs: number;
  count: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

/** Fixed-window counter — simple, adequate for VIA's actual traffic (see docs/reliability.md's load assumption), and cheap to reason about. */
export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const existing = buckets.get(key);
  if (!existing || now - existing.windowStartMs >= windowMs) {
    buckets.set(key, { windowStartMs: now, count: 1 });
    return { allowed: true, remaining: limit - 1, resetAtMs: now + windowMs };
  }
  existing.count += 1;
  const allowed = existing.count <= limit;
  return { allowed, remaining: Math.max(0, limit - existing.count), resetAtMs: existing.windowStartMs + windowMs };
}

/** Test-only reset — production code never needs this. */
export function resetRateLimitsForTest(): void {
  buckets.clear();
}

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  limit: Math.max(1, Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10),
  windowMs: Math.max(1_000, Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 5 * 60_000),
};

export const JARVIS_CHAT_RATE_LIMIT: RateLimitConfig = {
  limit: Math.max(1, Number(process.env.JARVIS_CHAT_RATE_LIMIT_MAX) || 30),
  windowMs: Math.max(1_000, Number(process.env.JARVIS_CHAT_RATE_LIMIT_WINDOW_MS) || 60_000),
};

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}
