'use client';

import ChatInterface from '@/components/ChatInterface';

export default function JarvisPage() {
  return (
    <div className="via-page flex min-h-full flex-col" style={{ background: 'var(--bg)' }}>
      <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">JARVIS</h1>
            <p className="mt-1 text-sm text-[var(--text-3)]">Varindo intelligence · Evidence, analytics, and controlled actions</p>
          </div>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-3)]">
            Zoho writes require approval
          </span>
        </div>

        <div className="min-h-[min(720px,75dvh)] flex-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]">
          <ChatInterface
            apiEndpoint="/api/jarvis/chat"
            assistantName="JARVIS"
            welcomeMessage="Hello, sir. I’m JARVIS. What would you like me to analyze or check?"
          />
        </div>
      </div>
    </div>
  );
}
