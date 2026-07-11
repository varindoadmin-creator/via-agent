import { NextRequest, NextResponse } from 'next/server';
import { roleForPassword, createSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = String(body?.password || '');
  const role = roleForPassword(password);

  if (!role) {
    return NextResponse.json({ success: false, error: 'Incorrect password' }, { status: 401 });
  }

  const token = await createSessionToken(role);
  const res = NextResponse.json({ success: true, role });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
