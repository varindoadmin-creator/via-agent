'use client';

import ChatInterface from '@/components/ChatInterface';

export default function SidekickPage() {
  return (
    <div className="via-page" style={{ background: 'var(--bg)', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[var(--text)] font-semibold text-2xl tracking-tight">Sidekick</h1>
        </div>

        <div style={{ flex: 1, minHeight: 'min(720px, 75dvh)', overflow: 'hidden', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)' }}>
          <ChatInterface />
        </div>
      </div>
    </div>
  );
}
