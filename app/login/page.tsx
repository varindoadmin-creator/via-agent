'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const mono = { fontFamily: 'JetBrains Mono, monospace' };

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Incorrect password');
      const next = searchParams.get('next') || '/';
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)' }}>
      <form onSubmit={handleSubmit} style={{ width: 320, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>V</div>
          <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 16 }}>VIA</div>
        </div>

        <div style={{ color: 'var(--text-3)', fontSize: 12, marginBottom: 6 }}>Password</div>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />

        {error && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', fontSize: 12 }}>{error}</div>}

        <button
          type="submit"
          disabled={loading || !password}
          style={{
            marginTop: 16, width: '100%', border: '1px solid var(--accent)',
            background: loading || !password ? 'var(--surface-3)' : 'var(--accent)',
            color: loading || !password ? 'var(--text-4)' : 'white',
            borderRadius: 8, padding: '10px 12px', fontWeight: 700,
            cursor: loading || !password ? 'not-allowed' : 'pointer', fontSize: 13,
          }}
        >{loading ? 'Signing in...' : 'Sign in'}</button>

        <div style={{ marginTop: 16, color: 'var(--text-4)', fontSize: 11, ...mono }}>Internal access only.</div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
