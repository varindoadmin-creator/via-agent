import { NextResponse } from 'next/server';
import { computeSlaStatus } from '@/lib/integrations/wati/stock/sla';

export const dynamic = 'force-dynamic';

function database() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

type InquiryRow = {
  id: string; created_at: string; conversation_id: string; customer_id: string | null;
  item_code: string | null; brand: string | null; requested_quantity: number | null; requested_unit: string | null;
  status: string; primary_source: string | null; active_stock_check_request_id: string | null;
  prepared_response_text: string | null; human_required: boolean; next_eligible_check_at: string | null;
};

type CheckRequestRow = { id: string; source: string; status: string; response_raw: string | null; parsed_availability: string | null };

export async function GET() {
  const db = database();
  if (!db) return NextResponse.json({ success: false, error: 'Stock inquiry storage is not configured.' }, { status: 503 });

  try {
    const inquiryParams = new URLSearchParams({
      select: 'id,created_at,conversation_id,customer_id,item_code,brand,requested_quantity,requested_unit,status,primary_source,active_stock_check_request_id,prepared_response_text,human_required,next_eligible_check_at',
      status: 'not.in.(CLOSED,CANCELLED)',
      order: 'created_at.desc',
      limit: '200',
    });
    const inquiryRes = await fetch(`${db.base}/rest/v1/stock_inquiries?${inquiryParams.toString()}`, { headers: db.headers, cache: 'no-store' });
    if (!inquiryRes.ok) throw new Error(`Supabase returned ${inquiryRes.status}`);
    const inquiries = await inquiryRes.json() as InquiryRow[];

    const checkRequestIds = Array.from(new Set(inquiries.map(i => i.active_stock_check_request_id).filter((v): v is string => Boolean(v))));
    let checkRequestsById = new Map<string, CheckRequestRow>();
    if (checkRequestIds.length > 0) {
      const crParams = new URLSearchParams({
        id: `in.(${checkRequestIds.join(',')})`,
        select: 'id,source,status,response_raw,parsed_availability',
      });
      const crRes = await fetch(`${db.base}/rest/v1/stock_check_requests?${crParams.toString()}`, { headers: db.headers, cache: 'no-store' });
      if (crRes.ok) {
        const rows = await crRes.json() as CheckRequestRow[];
        checkRequestsById = new Map(rows.map(r => [r.id, r]));
      }
    }

    const items = inquiries.map(inquiry => {
      const checkRequest = inquiry.active_stock_check_request_id ? checkRequestsById.get(inquiry.active_stock_check_request_id) : undefined;
      return {
        ...inquiry,
        source: inquiry.primary_source || checkRequest?.source || null,
        checkRequestId: checkRequest?.id ?? null,
        checkRequestStatus: checkRequest?.status ?? null,
        sla: computeSlaStatus(new Date(inquiry.created_at)),
      };
    });

    return NextResponse.json({ success: true, inquiries: items });
  } catch (error) {
    console.error('[WatiStockDashboard]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Unable to load stock inquiries.' }, { status: 500 });
  }
}
