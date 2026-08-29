import { NextResponse } from 'next/server';

export async function GET() {
  const modelConfigured = Boolean(process.env.OPENAI_API_KEY);
  const zohoConfigured = Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_ORG_ID);
  const approvalStoreConfigured = Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY));
  const ready = modelConfigured && zohoConfigured;
  return NextResponse.json({
    status: ready ? 'HEALTHY' : 'DEGRADED',
    ready,
    dependencies: { model: modelConfigured ? 'configured' : 'missing_config', zoho: zohoConfigured ? 'configured' : 'missing_config', approvalStore: approvalStoreConfigured ? 'configured' : 'missing_config' },
    note: 'Configuration readiness only. External dependencies are checked during bounded requests; no production data is read or changed by this endpoint.',
    ts: new Date().toISOString(),
  }, { status: ready ? 200 : 503 });
}
