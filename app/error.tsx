'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // ChunkLoadError means a new deployment replaced the JS chunks the current page references.
    // Auto-reload to pick up the latest build.
    if (error?.name === 'ChunkLoadError' || error?.message?.includes('Loading chunk')) {
      window.location.reload();
    }
  }, [error]);

  if (error?.name === 'ChunkLoadError' || error?.message?.includes('Loading chunk')) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f1117', color: '#888', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        Updating to latest version…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100vh', background: '#0f1117', color: '#ccc', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ fontSize: 14 }}>Something went wrong.</div>
      <button onClick={reset} style={{ padding: '8px 20px', background: '#dc714f', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
        Try again
      </button>
    </div>
  );
}
