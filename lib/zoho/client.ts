// ─── Zoho Books HTTP Client ───────────────────────────────────────────────────
// Server-side only.

import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from './auth';

export interface ZohoRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  queryParams?: Record<string, string | number | boolean>;
}

/**
 * Make an authenticated request to the Zoho Books API.
 */
export async function zohoRequest<T>(
  path: string,
  options: ZohoRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, queryParams = {} } = options;

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

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), fetchOptions);

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
