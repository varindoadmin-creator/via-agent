import { OAuth2Client } from 'google-auth-library';
import { NextRequest, NextResponse } from 'next/server';
import {
  CampaignMetrics,
  GoogleAdsCampaignRow,
  aggregateCampaigns,
  groupBrandCampaigns,
  normalizeCampaign,
  parseMatcher,
} from '@/lib/googleAds/report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type DateRange = { from: string; to: string; label: string };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Google Ads is not configured: missing ${name}`);
  return value;
}

function cleanId(value: string): string {
  return value.replace(/-/g, '');
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthRanges(month: string): { current: DateRange; previous: DateRange } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month. Use YYYY-MM.');
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  if (start.getFullYear() !== year || start.getMonth() !== monthNumber - 1) throw new Error('Invalid month.');
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const isCurrent = year === now.getFullYear() && monthNumber - 1 === now.getMonth();
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const throughDay = isCurrent ? now.getDate() : lastDay;
  const end = new Date(year, monthNumber - 1, Math.min(throughDay, lastDay));
  const previousStart = new Date(year, monthNumber - 2, 1);
  const previousLastDay = new Date(previousStart.getFullYear(), previousStart.getMonth() + 1, 0).getDate();
  const previousEnd = new Date(previousStart.getFullYear(), previousStart.getMonth(), Math.min(throughDay, previousLastDay));
  const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const previousLabel = previousStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return {
    current: { from: ymd(start), to: ymd(end), label },
    previous: { from: ymd(previousStart), to: ymd(previousEnd), label: previousLabel },
  };
}

async function accessToken(): Promise<string> {
  const client = new OAuth2Client(required('GOOGLE_ADS_CLIENT_ID'), required('GOOGLE_ADS_CLIENT_SECRET'));
  client.setCredentials({ refresh_token: required('GOOGLE_ADS_REFRESH_TOKEN') });
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Google Ads OAuth did not return an access token');
  return token.token;
}

async function fetchCampaigns(range: DateRange, token: string, rawCustomerId: string): Promise<CampaignMetrics[]> {
  const version = (process.env.GOOGLE_ADS_API_VERSION || 'v25').replace(/^v?/, 'v');
  const customerId = cleanId(rawCustomerId);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'developer-token': required('GOOGLE_ADS_DEVELOPER_TOKEN'),
  };
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  if (loginCustomerId) headers['login-customer-id'] = cleanId(loginCustomerId);

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `.replace(/\s+/g, ' ').trim();
  const response = await fetch(`https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`, {
    method: 'POST', headers, body: JSON.stringify({ query }), cache: 'no-store',
  });
  const body = await response.json().catch(() => null) as Array<{ results?: GoogleAdsCampaignRow[] }> | { error?: { message?: string; status?: string } } | null;
  if (!response.ok) {
    const apiError = body && !Array.isArray(body) ? body.error : undefined;
    throw new Error(`Google Ads ${response.status}: ${apiError?.message || apiError?.status || 'request failed'}`);
  }
  const batches = Array.isArray(body) ? body : [];
  return batches.flatMap(batch => batch.results || []).map(normalizeCampaign);
}

export async function GET(request: NextRequest) {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = request.nextUrl.searchParams.get('month') || fallbackMonth;
    const ranges = monthRanges(month);
    const token = await accessToken();
    const matchers = {
      Lamitak: parseMatcher(process.env.GOOGLE_ADS_LAMITAK_MATCH, 'LAMITAK'),
      EDL: parseMatcher(process.env.GOOGLE_ADS_EDL_MATCH, 'EDL'),
    };
    const brandCustomerIds = {
      Lamitak: process.env.GOOGLE_ADS_LAMITAK_CUSTOMER_ID?.trim(),
      EDL: process.env.GOOGLE_ADS_EDL_CUSTOMER_ID?.trim(),
    };
    const separateAccounts = Boolean(brandCustomerIds.Lamitak && brandCustomerIds.EDL);
    let brands;
    let previousBrands;
    let unmatchedCampaigns: string[] = [];

    if (separateAccounts) {
      const [lamitak, edl, previousLamitak, previousEdl] = await Promise.all([
        fetchCampaigns(ranges.current, token, brandCustomerIds.Lamitak!),
        fetchCampaigns(ranges.current, token, brandCustomerIds.EDL!),
        fetchCampaigns(ranges.previous, token, brandCustomerIds.Lamitak!),
        fetchCampaigns(ranges.previous, token, brandCustomerIds.EDL!),
      ]);
      brands = [aggregateCampaigns('Lamitak', lamitak), aggregateCampaigns('EDL', edl)];
      previousBrands = [aggregateCampaigns('Lamitak', previousLamitak), aggregateCampaigns('EDL', previousEdl)];
    } else {
      const customerId = required('GOOGLE_ADS_CUSTOMER_ID');
      const [currentCampaigns, previousCampaigns] = await Promise.all([
        fetchCampaigns(ranges.current, token, customerId), fetchCampaigns(ranges.previous, token, customerId),
      ]);
      brands = groupBrandCampaigns(currentCampaigns, matchers);
      previousBrands = groupBrandCampaigns(previousCampaigns, matchers);
      unmatchedCampaigns = currentCampaigns
        .filter(campaign => !Object.values(matchers).flat().some(term => campaign.name.toLowerCase().includes(term.toLowerCase())))
        .map(campaign => campaign.name);
    }
    return NextResponse.json({
      success: true,
      month,
      ranges,
      account_mode: separateAccounts ? 'separate' : 'shared',
      brands,
      previous_brands: previousBrands,
      unmatched_campaigns: unmatchedCampaigns,
      generated_at: new Date().toISOString(),
      basis: 'Read-only Google Ads campaign metrics. Current month is month-to-date; previous month is compared through the same day where possible.',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
