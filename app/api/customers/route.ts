import { NextRequest, NextResponse } from 'next/server';
import { getZohoAccessToken, getZohoApiBaseUrl, getZohoOrgId } from '@/lib/zoho/auth';

async function zohoGet(path: string) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${base}${path}${sep}organization_id=${orgId}`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function zohoPost(path: string, data: Record<string, unknown>) {
  const token = await getZohoAccessToken();
  const base = getZohoApiBaseUrl();
  const orgId = getZohoOrgId();
  const url = `${base}${path}?organization_id=${orgId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function fetchAllPages(path: string, key: string) {
  const items: Record<string, unknown>[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await zohoGet(path + sep + 'per_page=200&page=' + page);
    const batch = (res[key] || []) as Record<string, unknown>[];
    items.push(...batch);
    hasMore = batch.length === 200;
    page++;
    if (page > 20) break;
  }
  return items;
}

export interface Customer {
  contact_id: string;
  contact_name: string;
  company_name: string;
  email: string;
  phone: string;
  mobile: string;
  status: string;
  created_time: string;
  outstanding_receivable_amount: number;
  cf_tier: string;
  cf_customer_type: string;
  cf_region: string;
  last_so_date: string;        // most recent SO date
  last_so_number: string;
  so_count_90d: number;        // SOs in last 90 days
  total_90d: number;           // total sales last 90 days
  days_since_last_order: number;
  category: 'new' | 'active' | 'inactive';
}

// ─── GET /api/customers ───────────────────────────────────────────────────────

export async function GET() {
  try {
    await getZohoAccessToken();

    const now = new Date();
    const day7ago = new Date(now); day7ago.setDate(now.getDate() - 7);
    const day90ago = new Date(now); day90ago.setDate(now.getDate() - 90);
    const date7 = day7ago.toISOString().split('T')[0];
    const date90 = day90ago.toISOString().split('T')[0];

    // Fetch all active customers + recent SOs + recent invoices in parallel
    const [allCustomers, recentSOs, recentInvoices] = await Promise.all([
      fetchAllPages('/contacts?contact_type=customer&status=active&sort_column=created_time&sort_order=D', 'contacts'),
      // SOs from last 90 days — all statuses
      fetchAllPages('/salesorders?date_after=' + date90 + '&sort_column=date&sort_order=D', 'salesorders'),
      // Invoices from last 90 days — catches activity even when SO is closed
      fetchAllPages('/invoices?date_after=' + date90 + '&sort_column=date&sort_order=D', 'invoices'),
    ]);

    console.log(`[Customers] ${allCustomers.length} customers, ${recentSOs.length} SOs, ${recentInvoices.length} invoices in last 90d`);

    // Build customer_id → SO activity map
    interface SOActivity {
      last_date: string;
      last_number: string;
      count: number;
      total: number;
    }
    const soMap = new Map<string, SOActivity>();

    for (const so of recentSOs) {
      const cid = String(so.customer_id || '');
      if (!cid) continue;
      const soDate = String(so.date || '');
      const existing = soMap.get(cid);
      if (!existing) {
        soMap.set(cid, {
          last_date: soDate,
          last_number: String(so.salesorder_number || ''),
          count: 1,
          total: Number(so.total) || 0,
        });
      } else {
        if (soDate > existing.last_date) {
          existing.last_date = soDate;
          existing.last_number = String(so.salesorder_number || '');
        }
        existing.count++;
        existing.total += Number(so.total) || 0;
      }
    }

    // Also map invoices — customer_id on invoice gives us activity even when SO is closed/invoiced
    for (const inv of recentInvoices) {
      const cid = String(inv.customer_id || '');
      if (!cid) continue;
      const invDate = String(inv.date || '');
      const existing = soMap.get(cid);
      if (!existing) {
        soMap.set(cid, {
          last_date: invDate,
          last_number: String(inv.invoice_number || ''),
          count: 1,
          total: Number(inv.total) || 0,
        });
      } else {
        // Update last activity date if invoice is more recent
        if (invDate > existing.last_date) {
          existing.last_date = invDate;
          existing.last_number = String(inv.invoice_number || '');
        }
        // Don't double-count amount — SO already counted
      }
    }

    // Classify customers
    const customers: Customer[] = allCustomers.map(c => {
      const cid = String(c.contact_id);
      const createdTime = String(c.created_time || '');
      const createdDate = createdTime.split('T')[0];
      const activity = soMap.get(cid);

      const lastSoDate = activity?.last_date || '';
      const so90 = activity?.count || 0;
      const total90 = activity?.total || 0;

      // Days since last order
      let daysSince = 999;
      if (lastSoDate) {
        daysSince = Math.floor((now.getTime() - new Date(lastSoDate).getTime()) / 86400000);
      }

      // New = created in last 7 days (regardless of SO activity)
      const isNew = createdDate >= date7;
      // Active = has SO or invoice activity in last 90 days (AND not new)
      const isActive = !isNew && so90 > 0;
      // Inactive = not new AND no activity in 90 days
      // New customers never appear in Inactive even if they have no orders yet
      const category: Customer['category'] = isNew ? 'new' : isActive ? 'active' : 'inactive';

      return {
        contact_id: cid,
        contact_name: String(c.contact_name || ''),
        company_name: String(c.company_name || ''),
        email: String(c.email || ''),
        phone: String(c.phone || c.mobile || ''),
        mobile: String(c.mobile || ''),
        status: String(c.status || ''),
        created_time: createdTime,
        outstanding_receivable_amount: Number(c.outstanding_receivable_amount) || 0,
        cf_tier: String(c.cf_tier || ''),
        cf_customer_type: String(c.cf_customer_type || ''),
        cf_region: String(c.cf_region || ''),
        last_so_date: lastSoDate,
        last_so_number: activity?.last_number || '',
        so_count_90d: so90,
        total_90d: total90,
        days_since_last_order: daysSince,
        category,
      };
    });

    const newCustomers = customers.filter(c => c.category === 'new');
    const activeCustomers = customers.filter(c => c.category === 'active').sort((a, b) => b.total_90d - a.total_90d);
    const inactiveCustomers = customers.filter(c => c.category === 'inactive').sort((a, b) => a.days_since_last_order - b.days_since_last_order);

    console.log(`[Customers] new=${newCustomers.length} active=${activeCustomers.length} inactive=${inactiveCustomers.length}`);

    return NextResponse.json({
      success: true,
      new_customers: newCustomers,
      active_customers: activeCustomers,
      inactive_customers: inactiveCustomers,
      total: customers.length,
      so_count_90d: recentSOs.length,
    });

  } catch (err) {
    console.error('[Customers] Error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ─── POST /api/customers — Create new customer ────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      contact_name, company_name, email, phone, mobile,
      payment_terms, npwp,
      cf_tier, cf_customer_type, cf_region,
      billing_address, tax_id, pricebook_id,
    } = body;

    if (!contact_name?.trim()) {
      return NextResponse.json({ error: 'contact_name is required' }, { status: 400 });
    }
    if (!cf_tier) return NextResponse.json({ error: 'Discount Tier is required' }, { status: 400 });
    if (!cf_customer_type) return NextResponse.json({ error: 'Vendor/Customer Type is required' }, { status: 400 });
    if (!cf_region) return NextResponse.json({ error: 'Region is required' }, { status: 400 });

    // Custom fields — sent as array with api_name + value
    const custom_fields = [
      { api_name: 'cf_tier',           value: cf_tier },
      { api_name: 'cf_customer_type',  value: cf_customer_type },
      { api_name: 'cf_region',         value: cf_region },
    ];
    if (npwp?.trim()) {
      custom_fields.push({ api_name: 'cf_npwp', value: npwp.trim() });
    }

    const payload: Record<string, unknown> = {
      contact_name: contact_name.trim(),
      contact_type: 'customer',
      custom_fields,
    };

    if (company_name?.trim()) payload.company_name = company_name.trim();
    if (email?.trim()) payload.email = email.trim();
    if (phone?.trim()) payload.phone = String(phone).trim().replace(/[^0-9+]/g, '');
    if (mobile?.trim()) payload.mobile = String(mobile).trim().replace(/[^0-9+]/g, '');
    if (payment_terms !== undefined) payload.payment_terms = Number(payment_terms);
    if (tax_id) payload.tax_id = tax_id;
    if (pricebook_id) payload.pricebook_id = pricebook_id;

    // Always set Accounts Receivable account
    payload.account_id = '8607767000000000364';

    // Billing address + shipping address (copy billing)
    if (billing_address) {
      const ba = billing_address as Record<string, string>;
      if (ba.address || ba.city) {
        const addrObj = {
          address: ba.address || '',
          street2: ba.street2 || '',
          city: ba.city || '',
          state: ba.state || '',
          zip: ba.zip || '',
          country: 'Indonesia',
          country_code: 'ID',
          phone: '',
          fax: '',
          attention: '',
        };
        payload.billing_address = addrObj;
        // Always copy billing to shipping
        payload.shipping_address = { ...addrObj };
      }
    }

    const res = await zohoPost('/contacts', payload);
    const contact = res.contact;

    return NextResponse.json({
      success: true,
      contact_id: contact?.contact_id,
      contact_name: contact?.contact_name,
      message: 'Customer created successfully',
    });

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// ─── PATCH /api/customers — Update customer phone/mobile ─────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { contact_id, mobile, phone } = body as {
      contact_id: string; mobile?: string; phone?: string;
    };

    if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

    const token = await getZohoAccessToken();
    const base = getZohoApiBaseUrl();
    const orgId = getZohoOrgId();

    const payload: Record<string, string> = {};
    if (mobile !== undefined) payload.mobile = mobile.trim();
    if (phone !== undefined) payload.phone = phone.trim();

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const res = await fetch(`${base}/contacts/${contact_id}?organization_id=${orgId}`, {
      method: 'PUT',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Zoho ${res.status}: ${JSON.stringify(data)}`);

    return NextResponse.json({
      success: true,
      contact_id,
      mobile: data.contact?.mobile,
      message: 'Phone updated',
    });

  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
