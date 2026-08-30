import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { getJarvisReleaseRecord } from '@/lib/jarvis/production/release';

export async function GET(req: NextRequest) {
  const role = await verifySessionToken(req.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!role) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  return NextResponse.json({ release: getJarvisReleaseRecord() });
}
