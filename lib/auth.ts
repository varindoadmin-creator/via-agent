// ─── Login session ──────────────────────────────────────────────────────────
// Two shared role accounts (Admin, Director), no per-user directory. Uses the
// Web Crypto API (not Node's `crypto` module) so the same code verifies a
// session identically in Edge middleware, Node API routes, and the Server
// Component root layout.

export type Role = 'admin' | 'director';

export const SESSION_COOKIE_NAME = 'via_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.warn('[auth] SESSION_SECRET is not set — using an insecure dev-only fallback.');
    return 'dev-insecure-secret-change-me';
  }
  return secret;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sign(payload: string): Promise<string> {
  const key = await getKey();
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toHex(sigBuf);
}

export async function createSessionToken(role: Role): Promise<string> {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${role}.${expires}`;
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<Role | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [role, expiresStr, sig] = parts;
  if (role !== 'admin' && role !== 'director') return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;

  const expected = await sign(`${role}.${expiresStr}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? role : null;
}

export function roleForPassword(password: string): Role | null {
  if (!password) return null;
  if (process.env.DIRECTOR_PASSWORD && password === process.env.DIRECTOR_PASSWORD) return 'director';
  if (process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) return 'admin';
  return null;
}
