'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Bug } from 'lucide-react';

interface JsonDebugPanelProps {
  data: unknown;
  label?: string;
}

export default function JsonDebugPanel({ data, label = 'Debug Info' }: JsonDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!data) return null;

  return (
    <div className="mt-2 rounded-md border border-[#1e2130] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[#0d1117] hover:bg-[#161b22] transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown className="w-3 h-3 text-[#475569]" />
        ) : (
          <ChevronRight className="w-3 h-3 text-[#475569]" />
        )}
        <Bug className="w-3 h-3 text-[#475569]" />
        <span className="text-[11px] text-[#475569] font-mono uppercase tracking-wider">
          {label}
        </span>
      </button>

      {isOpen && (
        <pre className="p-3 bg-[#0d1117] text-[#7dd3fc] text-xs font-mono overflow-auto max-h-96 leading-relaxed border-t border-[#1e2130]">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
