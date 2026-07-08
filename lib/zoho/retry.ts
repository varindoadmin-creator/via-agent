// ─── Retry wrapper for Zoho HTTP calls ────────────────────────────────────────
// Zoho calls occasionally hit transient DNS/connection blips (ENOTFOUND,
// ECONNRESET, timeouts) or Zoho-side 429/5xx responses. Retrying a couple of
// times with backoff clears most of these without surfacing an error to the
// user. 4xx errors (bad auth, bad request) are not retried — retrying won't
// fix a config/credentials problem.

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  retryOnStatus?: (status: number) => boolean;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 400;
const RETRYABLE_ERROR_CODES = new Set([
  'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT',
]);

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as { cause?: { code?: string } }).cause;
  const code = cause?.code ?? (err as { code?: string }).code;
  if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
  // Node/undici throws a generic "fetch failed" TypeError for most network-level failures
  return err.name === 'TypeError' && err.message === 'fetch failed';
}

function defaultRetryOnStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch() with retry + exponential backoff (with jitter) for transient
 * network failures and retryable HTTP statuses.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {}
): Promise<Response> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelay = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const retryOnStatus = opts.retryOnStatus ?? defaultRetryOnStatus;

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, init);
      if (!response.ok && attempt < retries && retryOnStatus(response.status)) {
        await sleep(baseDelay * 2 ** attempt + Math.random() * 100);
        continue;
      }
      return response;
    } catch (err) {
      if (attempt < retries && isRetryableNetworkError(err)) {
        await sleep(baseDelay * 2 ** attempt + Math.random() * 100);
        continue;
      }
      throw err;
    }
  }
}
