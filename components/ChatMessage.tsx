'use client';

import React, { useState } from 'react';
import { Bot, User, Copy, Check, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { ChatMessage as ChatMessageType } from '@/types/chat';
import { SOPreview } from '@/types/order';
import ActionPreviewCard from './ActionPreviewCard';
import WarningCard from './WarningCard';
import JsonDebugPanel from './JsonDebugPanel';

interface ChatMessageProps {
  message: ChatMessageType;
  showDebug?: boolean;
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="loading-dot w-2 h-2 rounded-full bg-[#3b82f6]" />
      <span className="loading-dot w-2 h-2 rounded-full bg-[#3b82f6]" />
      <span className="loading-dot w-2 h-2 rounded-full bg-[#3b82f6]" />
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  // Convert markdown-like formatting to JSX
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableHeaders: string[] = [];

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={elements.length} className="overflow-x-auto my-3">
          <table className="via-table">
            {tableHeaders.length > 0 && (
              <thead>
                <tr>
                  {tableHeaders.map((h, i) => (
                    <th key={i}>{h.trim()}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableRows.map((row, ridx) => (
                <tr key={ridx}>
                  {row.map((cell, cidx) => (
                    <td key={cidx}>{formatInlineMarkdown(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      tableHeaders = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLines = [];
        if (inTable) { flushTable(); }
      } else {
        inCodeBlock = false;
        elements.push(
          <pre key={elements.length} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3 overflow-x-auto my-2 font-mono text-sm text-[var(--accent-text)] leading-relaxed">
            {codeLines.join('\n')}
          </pre>
        );
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Tables
    if (line.trim().startsWith('|')) {
      const cells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (line.includes('---')) {
        // Separator row — skip
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headings
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={elements.length} className="text-base font-bold text-[var(--text)] mt-4 mb-2 pb-1 border-b border-[var(--border)]">
          {formatInlineMarkdown(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={elements.length} className="text-sm font-semibold text-[var(--text-3)] mt-3 mb-1.5 uppercase tracking-wider">
          {formatInlineMarkdown(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith('> ')) {
      // Blockquote
      elements.push(
        <div key={elements.length} className="border-l-2 border-blue-600/50 pl-3 py-0.5 my-1 text-sm text-[var(--text-3)] italic">
          {formatInlineMarkdown(line.slice(2))}
        </div>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={elements.length} className="flex items-start gap-2 text-sm text-[var(--text-3)] my-0.5">
          <span className="text-[var(--text-3)] mt-1 shrink-0">•</span>
          <span>{formatInlineMarkdown(line.slice(2))}</span>
        </div>
      );
    } else if (line.startsWith('---')) {
      elements.push(<hr key={elements.length} className="border-[var(--border)] my-3" />);
    } else if (line.trim() === '') {
      elements.push(<div key={elements.length} className="h-1" />);
    } else {
      elements.push(
        <p key={elements.length} className="text-sm text-[#c8d3e0] leading-relaxed my-0.5">
          {formatInlineMarkdown(line)}
        </p>
      );
    }
  }

  if (inTable) flushTable();

  return <div className="space-y-0.5">{elements}</div>;
}

function formatInlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[.*?\]\(.*?\))/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-[var(--text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="bg-[var(--surface-3)] px-1.5 py-0.5 rounded text-[var(--accent-text)] font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      const label = linkMatch[1];
      const href = linkMatch[2];
      return (
        <a key={idx} href={href}
          className="text-[var(--accent)] hover:underline font-medium"
          {...(href.startsWith('/') ? {} : { target: '_blank', rel: 'noreferrer' })}>
          {label}
        </a>
      );
    }
    return part;
  });
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'warning':
    case 'so_preview':
    case 'so_update_preview':
      return <AlertTriangle className="w-3 h-3 text-amber-400" />;
    case 'action_result':
      return <CheckCircle className="w-3 h-3 text-[var(--success)]" />;
    case 'error':
      return null;
    default:
      return null;
  }
}

// ─── Update Action Buttons ───────────────────────────────────────────────────

interface Action {
  id: string;
  label: string;
  description: string;
  count: number;
  endpoint: string;
  method: string;
  color: string;
}

interface ActionResult {
  invoice_number?: string;
  success: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

function UpdateActions({ actions }: { actions: Action[] }) {
  const [running, setRunning] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, { sent?: number; skipped?: number; failed?: number; error?: string }>>({});

  async function runAction(action: Action) {
    setRunning(action.id);
    try {
      const res = await fetch(action.endpoint, { method: action.method });
      const data = await res.json();
      if (data.success !== undefined) {
        setResults(prev => ({
          ...prev,
          [action.id]: {
            sent: data.sent,
            skipped: data.skipped,
            failed: data.failed,
            error: data.error,
          }
        }));
      }
    } catch (e) {
      setResults(prev => ({ ...prev, [action.id]: { error: String(e) } }));
    } finally {
      setRunning(null);
    }
  }

  const colorMap: Record<string, string> = {
    accent:  'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white',
    info:    'bg-[var(--info-bg)] text-[var(--info)] border border-[var(--info-border)] hover:opacity-80',
    warning: 'bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning-border)] hover:opacity-80',
    success: 'bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success-border)] hover:opacity-80',
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="text-[var(--text-4)] text-xs font-medium uppercase tracking-wider" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
        Available Actions
      </div>
      {actions.map(action => {
        const result = results[action.id];
        const isRunning = running === action.id;
        const isDone = result !== undefined;

        return (
          <div key={action.id} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
            <div className="flex-1">
              <div className="text-[var(--text)] text-xs font-medium">{action.description}</div>
              {isDone && !result.error && (
                <div className="text-xs mt-1 space-x-2">
                  {result.sent != null && result.sent > 0 && (
                    <span className="text-[var(--success)]">
                      ✓ {result.sent} {action.id === 'convert_delivered' ? 'converted' : action.id === 'approve_pos' ? 'approved' : 'sent'}
                    </span>
                  )}
                  {result.skipped != null && result.skipped > 0 && <span className="text-[var(--text-4)]">⊘ {result.skipped} skipped (stock)</span>}
                  {result.failed != null && result.failed > 0 && <span className="text-[var(--danger)]">✗ {result.failed} failed</span>}
                  {result.sent === 0 && !result.failed && <span className="text-[var(--text-4)]">Nothing to action</span>}
                </div>
              )}
              {isDone && result.error && (
                <div className="text-[var(--danger)] text-xs mt-1">✗ {result.error}</div>
              )}
            </div>
            <button
              onClick={() => !isDone && runAction(action)}
              disabled={isRunning || isDone}
              className={`px-4 py-1.5 text-xs font-medium rounded-lg transition-all disabled:opacity-60 ${
                isDone
                  ? 'bg-[var(--surface-3)] text-[var(--text-4)] cursor-default'
                  : colorMap[action.color] || colorMap.accent
              }`}
            >
              {isRunning ? '…' : isDone ? '✓ Done' : action.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function ChatMessage({ message, showDebug = false }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 px-4 py-4 animate-fade-in group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${
        isUser
          ? 'bg-[var(--accent-light)] border border-[var(--accent-border)]'
          : 'bg-[var(--accent-light)] border border-[var(--accent-border)]'
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-[var(--accent-text)]" />
        ) : (
          <Bot className="w-4 h-4 text-[var(--accent)]" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'flex flex-col items-end' : ''}`}>
        {/* Name + time */}
        <div className={`flex items-center gap-2 mb-1.5 ${isUser ? 'flex-row-reverse' : ''}`}>
          <span className={`text-xs font-semibold ${isUser ? 'text-[var(--accent-text)]' : 'text-[var(--accent)]'}`}>
            {isUser ? 'You' : 'VIA'}
          </span>
          <span className="text-xs text-[var(--text-4)]">
            {new Date(message.timestamp).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <TypeIcon type={message.type} />
        </div>

        {/* Message bubble */}
        <div className={`max-w-[90%] relative ${isUser ? '' : 'w-full'}`}>
          {message.isLoading ? (
            <div className="px-4 py-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
              <LoadingDots />
            </div>
          ) : (
            <div className={`rounded-xl px-4 py-3 ${
              isUser
                ? 'bg-[var(--accent-light)] border border-[var(--accent-border)]'
                : message.isError
                ? 'bg-red-950/30 border border-red-800/40'
                : 'bg-[var(--surface)] border border-[var(--border)] shadow-sm'
            }`}>
              {/* Attachments */}
              {message.attachments?.length ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {message.attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--surface-3)] border border-[var(--border)] text-xs text-[var(--text-3)]"
                    >
                      <span>📎</span>
                      <span>{att.name}</span>
                      <span className="text-[var(--text-3)]">
                        ({Math.round(att.size / 1024)}KB)
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Main content */}
              <div className="message-content">
                <MessageContent content={message.content} />
              </div>

              {/* Update Action Buttons */}
              {message.type === 'update' && message.metadata?.actions && (message.metadata.actions as unknown[]).length > 0 && (
                <UpdateActions actions={message.metadata.actions as Action[]} />
              )}

              {/* SO Preview Card */}
              {(message.type === 'so_preview' || message.type === 'so_update_preview') &&
                message.metadata?.previewData && (
                  <ActionPreviewCard
                    preview={message.metadata.previewData as SOPreview}
                    type={message.type === 'so_preview' ? 'create' : 'update'}
                  />
                )}

              {/* Warnings */}
              {message.metadata?.warnings && (message.metadata.warnings as string[]).length > 0 && (
                <WarningCard messages={message.metadata.warnings as string[]} />
              )}

              {/* Debug panel */}
              {showDebug && message.metadata && (
                <JsonDebugPanel data={message.metadata} label="Metadata" />
              )}
            </div>
          )}

          {/* Copy button */}
          {!isUser && !message.isLoading && (
            <button
              onClick={handleCopy}
              className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-[var(--surface-3)] border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-3)]"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
