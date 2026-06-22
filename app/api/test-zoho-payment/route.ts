import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl } from '@/lib/zoho/auth';

const ORG_ID = () => process.env.ZOHO_ORGANIZATION_ID || '';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${ORG_ID()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` }, signal: controller.signal });
    const body = await res.json();
    if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  try {
    const results: Record<string, unknown> = {};

    // Get chart of accounts — find bank accounts
    try {
      const res = await zohoGet('/chartofaccounts?account_type=bank');
      results.bank_accounts = res.chartofaccounts?.map((a: Record<string, unknown>) => ({
        account_id: a.account_id,
        account_name: a.account_name,
        account_type: a.account_type,
        currency_code: a.currency_code,
        is_primary_account: a.is_primary_account,
      }));
    } catch(e) {
      results.bank_accounts_error = String(e);
    }

    // Also try cash accounts
    try {
      const res = await zohoGet('/chartofaccounts?account_type=cash');
      results.cash_accounts = res.chartofaccounts?.map((a: Record<string, unknown>) => ({
        account_id: a.account_id,
        account_name: a.account_name,
      }));
    } catch(e) {
      results.cash_accounts_error = String(e);
    }

    // Check an existing payment to see what account_id looks like
    try {
      const res = await zohoGet('/customerpayments?per_page=3');
      results.existing_payments = res.payments?.map((p: Record<string, unknown>) => ({
        payment_number: p.payment_number,
        payment_mode: p.payment_mode,
        account_id: p.account_id,
        account_name: p.account_name,
        amount: p.amount,
        date: p.date,
      }));
    } catch(e) {
      results.existing_payments_error = String(e);
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
