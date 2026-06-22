// ─── Zoho Books Authentication ────────────────────────────────────────────────
// Server-side only. Never import this in client components.

import { ZohoTokenResponse } from '@/types/zoho';

// In-memory token cache (per server process)
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Get the Zoho API base URL based on the DC (data center) setting.
 */
export function getZohoApiBaseUrl(): string {
  if (process.env.ZOHO_API_BASE_URL) {
    return process.env.ZOHO_API_BASE_URL;
  }
  const dc = (process.env.ZOHO_DC || 'com').toLowerCase();
  const dcMap: Record<string, string> = {
    us: 'https://www.zohoapis.com/books/v3',
    com: 'https://www.zohoapis.com/books/v3',
    sg: 'https://www.zohoapis.com/books/v3', // SG uses same endpoint
    eu: 'https://www.zohoapis.eu/books/v3',
    au: 'https://www.zohoapis.com.au/books/v3',
    in: 'https://www.zohoapis.in/books/v3',
    jp: 'https://www.zohoapis.jp/books/v3',
  };
  return dcMap[dc] || dcMap['com'];
}

/**
 * Get the Zoho OAuth base URL based on the DC.
 */
export function getZohoOAuthUrl(): string {
  const dc = (process.env.ZOHO_DC || 'com').toLowerCase();
  const dcMap: Record<string, string> = {
    us: 'https://accounts.zoho.com',
    com: 'https://accounts.zoho.com',
    sg: 'https://accounts.zoho.com', // SG accounts uses .com
    eu: 'https://accounts.zoho.eu',
    au: 'https://accounts.zoho.com.au',
    in: 'https://accounts.zoho.in',
    jp: 'https://accounts.zoho.jp',
  };
  return dcMap[dc] || dcMap['com'];
}

/**
 * Refresh the Zoho access token using the refresh token.
 * Caches the token in memory to avoid unnecessary refreshes.
 */
export async function getZohoAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 300_000) {
    return cachedToken;
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Zoho credentials are not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in .env.local'
    );
  }

  const oauthBase = getZohoOAuthUrl();
  const url = `${oauthBase}/oauth/v2/token`;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zoho token refresh failed: ${response.status} ${text}`);
  }

  const data: ZohoTokenResponse = await response.json();

  if (!data.access_token) {
    throw new Error('Zoho token refresh returned no access_token');
  }

  // Cache the token
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  return cachedToken;
}

/**
 * Get the Zoho organization ID from environment.
 */
export function getZohoOrgId(): string {
  const orgId = process.env.ZOHO_ORGANIZATION_ID;
  if (!orgId) {
    throw new Error('ZOHO_ORGANIZATION_ID is not set in .env.local');
  }
  return orgId;
}

/**
 * Clear the cached token (useful for testing or forced refresh).
 */
export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}
