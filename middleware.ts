import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/api/ping'];

// Hit by external cron-job.org scheduled jobs (no browser session available),
// so these bypass session auth via a shared secret header instead.
const CRON_PATHS = ['/api/shipments/auto-invoice', '/api/customers/auto-repair', '/api/invoices-page/auto-send', '/api/inventory/price-lists/sync', '/api/salesperson-map/sync'];

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('x-cron-secret') || '';
  if (provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

// Path prefixes the 'admin' role may access — matches exactly what's visible
// in today's sidebar (Approvals + Requests). Everything else is Director-only.
const ADMIN_ALLOWED_PREFIXES = [
  '/approvals/so', '/approvals/po', '/api/approvals',
  '/requests', '/api/requests',
  '/documents', '/api/documents',
  '/guide',
  '/customers', '/api/customers',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

function adminAllowed(pathname: string): boolean {
  return ADMIN_ALLOWED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (CRON_PATHS.includes(pathname) && isCronAuthorized(req)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const role = await verifySessionToken(token);
  const isApi = pathname.startsWith('/api/');

  if (!role) {
    if (isApi) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (role === 'admin' && !adminAllowed(pathname)) {
    if (isApi) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = '/approvals/so';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
