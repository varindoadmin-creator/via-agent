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

function oauthClient(): OAuth2Client {
  const client = new OAuth2Client(required('GOOGLE_ADS_CLIENT_ID'), required('GOOGLE_ADS_CLIENT_SECRET'));
  client.setCredentials({ refresh_token: required('GOOGLE_ADS_REFRESH_TOKEN') });
  return client;
}

type GoogleAdsResponse = Array<{ results?: GoogleAdsCampaignRow[] }>;
type GoogleAdsErrorBody = { error?: { message?: string; status?: string } };

function googleAdsError(error: unknown, stage: string): Error {
  if (error instanceof Error && 'response' in error) {
    const response = (error as Error & { response?: { data?: unknown } }).response;
    const body = response?.data as GoogleAdsErrorBody | undefined;
    const apiError = body?.error;
    return new Error(`${stage}: ${apiError?.message || apiError?.status || error.message}`);
  }
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
  return new Error(`${stage}: ${error instanceof Error ? error.message : String(error)}${cause}`);
}

async function fetchCampaigns(range: DateRange, client: OAuth2Client, rawCustomerId: string): Promise<CampaignMetrics[]> {
  const version = (process.env.GOOGLE_ADS_API_VERSION || 'v25').replace(/^v?/, 'v');
  const customerId = cleanId(rawCustomerId);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Secret Manager values are sometimes entered with an embedded line break.
    // Google Ads developer tokens are whitespace-free, so normalize before using
    // the value as an HTTP header.
    'developer-token': required('GOOGLE_ADS_DEVELOPER_TOKEN').replace(/\s+/g, ''),
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
  try {
    const response = await client.request<GoogleAdsResponse>({
      url: `https://googleads.googleapis.com/${version}/customers/${customerId}/googleAds:searchStream`,
      method: 'POST',
      headers,
      data: { query },
    });
    const batches = Array.isArray(response.data) ? response.data : [];
    return batches.flatMap(batch => batch.results || []).map(normalizeCampaign);
  } catch (error) {
    throw googleAdsError(error, `Google Ads account ${customerId}`);
  }
}

export async function GET(request: NextRequest) {
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = request.nextUrl.searchParams.get('month') || fallbackMonth;
    const ranges = monthRanges(month);
    const client = oauthClient();
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
        fetchCampaigns(ranges.current, client, brandCustomerIds.Lamitak!),
        fetchCampaigns(ranges.current, client, brandCustomerIds.EDL!),
        fetchCampaigns(ranges.previous, client, brandCustomerIds.Lamitak!),
        fetchCampaigns(ranges.previous, client, brandCustomerIds.EDL!),
      ]);
      brands = [aggregateCampaigns('Lamitak', lamitak), aggregateCampaigns('EDL', edl)];
      previousBrands = [aggregateCampaigns('Lamitak', previousLamitak), aggregateCampaigns('EDL', previousEdl)];
    } else {
      const customerId = required('GOOGLE_ADS_CUSTOMER_ID');
      const [currentCampaigns, previousCampaigns] = await Promise.all([
        fetchCampaigns(ranges.current, client, customerId), fetchCampaigns(ranges.previous, client, customerId),
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
