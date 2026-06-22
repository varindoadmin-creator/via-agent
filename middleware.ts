import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE = 'via_session';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let API routes, login page, and static assets through without checking
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  if (!token || !(await verifyToken(token))) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

async function verifyToken(token: string): Promise<boolean> {
  try {
    const dot = token.indexOf('.');
    if (dot === -1) return false;
    const expiry = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const exp = parseInt(expiry, 10);
    if (isNaN(exp) || Math.floor(Date.now() / 1000) > exp) return false;

    const secret = process.env.VIA_SECRET || 'via-default-secret-change-me';
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expiry));
    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    return expectedB64 === sig;
  } catch {
    return false;
  }
}
