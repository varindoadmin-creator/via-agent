// ─── Zoho Books HTTP Client ───────────────────────────────────────────────────
// Server-side only.

import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from './auth.ts';
import { fetchWithRetry } from './retry.ts';

export interface ZohoRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  queryParams?: Record<string, string | number | boolean>;
  /** Set to 0 for non-idempotent writes where an automatic retry could duplicate data. */
  retries?: number;
  /** Explicit per-request deadline. Defaults to 20 seconds. */
  timeoutMs?: number;
}

/**
 * Make an authenticated request to the Zoho Books API.
 */
export async function zohoRequest<T>(
  path: string,
  options: ZohoRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, queryParams = {}, retries, timeoutMs = 20_000 } = options;

  const accessToken = await getZohoAccessToken();
  const orgId = getZohoOrgId();
  const baseUrl = getZohoApiBaseUrl();

  // Build URL with organization_id and any extra query params
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('organization_id', orgId);

  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), Math.max(1_000, timeoutMs));
  const fetchOptions: RequestInit = {
    method,
    headers,
    signal: abort.signal,
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  // GET calls are safe to retry. Mutations must opt in explicitly only when a
  // caller has durable idempotency/reconciliation guarantees.
  const safeRetries = retries ?? (method === 'GET' ? 2 : 0);
  let response: Response;
  try {
    response = await fetchWithRetry(url.toString(), fetchOptions, { retries: safeRetries });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Zoho API error ${response.status} on ${method} ${path}: ${errorText}`
    );
  }

  const data = await response.json();

  // Zoho returns code 0 for success
  if (data.code !== undefined && data.code !== 0) {
    throw new Error(`Zoho API returned error code ${data.code}: ${data.message}`);
  }

  return data as T;
}

/**
 * Check if mock mode is enabled.
 */
export function isMockMode(): boolean {
  return process.env.USE_MOCK_ZOHO === 'true';
}
