'use client';

import React from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';

type WarningLevel = 'info' | 'warning' | 'error' | 'success';

interface WarningCardProps {
  messages: string[];
  level?: WarningLevel;
  title?: string;
}

const CONFIG: Record<WarningLevel, {
  icon: React.ReactNode;
  border: string;
  bg: string;
  titleColor: string;
  textColor: string;
  iconColor: string;
}> = {
  info: {
    icon: <Info className="w-4 h-4" />,
    border: 'border-blue-800/40',
    bg: 'bg-blue-950/30',
    titleColor: 'text-[var(--accent)]',
    textColor: 'text-blue-300/80',
    iconColor: 'text-[var(--accent)]',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    border: 'border-amber-800/40',
    bg: 'bg-amber-950/30',
    titleColor: 'text-amber-400',
    textColor: 'text-amber-300/80',
    iconColor: 'text-amber-400',
  },
  error: {
    icon: <AlertCircle className="w-4 h-4" />,
    border: 'border-red-800/40',
    bg: 'bg-red-950/30',
    titleColor: 'text-[var(--danger)]',
    textColor: 'text-[var(--danger)]/80',
    iconColor: 'text-[var(--danger)]',
  },
  success: {
    icon: <CheckCircle className="w-4 h-4" />,
    border: 'border-green-800/40',
    bg: 'bg-green-950/30',
    titleColor: 'text-[var(--success)]',
    textColor: 'text-green-300/80',
    iconColor: 'text-[var(--success)]',
  },
};

export default function WarningCard({
  messages,
  level = 'warning',
  title,
}: WarningCardProps) {
  if (!messages || messages.length === 0) return null;

  const config = CONFIG[level];

  return (
    <div className={`rounded-md border ${config.border} ${config.bg} p-3 mt-2`}>
      <div className={`flex items-center gap-2 mb-2 ${config.iconColor}`}>
        {config.icon}
        <span className={`text-xs font-semibold uppercase tracking-wider ${config.titleColor}`}>
          {title || level === 'warning' ? 'Warnings' : level === 'error' ? 'Errors' : level === 'success' ? 'Success' : 'Info'}
        </span>
      </div>
      <ul className="space-y-1">
        {messages.map((msg, idx) => (
          <li key={idx} className={`text-xs ${config.textColor} flex items-start gap-2`}>
            <span className="mt-0.5 shrink-0">•</span>
            <span>{msg}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
