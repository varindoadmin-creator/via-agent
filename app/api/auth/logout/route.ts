import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ success: true });
  // Match every attribute used when the cookie was set (login/route.ts) — a mismatched
  // attribute (e.g. missing `secure`) can make some browsers treat this as a different
  // cookie and fail to clear the real session.
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
