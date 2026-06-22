import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  let password: string;
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const expected = process.env.VIA_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: 'VIA_PASSWORD is not configured on this server.' }, { status: 500 });
  }
  if (!password || password.trim() !== expected.trim()) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('via_session', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return res;
}
