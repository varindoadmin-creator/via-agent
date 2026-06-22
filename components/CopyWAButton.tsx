'use client';
import { useState } from 'react';

export function CopyWAButton({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all ${
        copied
          ? 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]'
          : 'bg-[var(--surface-3)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
      }`}
    >
      {copied ? '✓ Copied!' : '📋 Copy WA Message'}
    </button>
  );
}
