'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, X, Loader2, Image, FileText } from 'lucide-react';
import { Attachment } from '@/types/chat';

interface ChatInputProps {
  onSend: (message: string, attachments: Attachment[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const QUICK_COMMANDS = [
  { label: 'Create SO', text: 'I want to create a sales order for ' },
  { label: 'Check SO vs Stock', text: 'Check SO-' },
  { label: 'Price Check', text: 'What is the price of ' },
  { label: 'Find Customer', text: 'Find customer ' },
  { label: 'Search Item', text: 'Search for item ' },
];

export default function ChatInput({
  onSend,
  isLoading,
  disabled = false,
  placeholder = 'Type a message, paste an order, or upload a file...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed && attachments.length === 0) return;
    if (isLoading || disabled) return;

    onSend(trimmed, attachments);
    setMessage('');
    setAttachments([]);
    setUploadError(null);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, attachments, isLoading, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          setUploadError(result.error || 'Upload failed');
          continue;
        }

        setAttachments((prev) => [...prev, result.attachment as Attachment]);
      } catch (err) {
        setUploadError('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    }

    setIsUploading(false);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleQuickCommand = (text: string) => {
    setMessage(text);
    textareaRef.current?.focus();
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-3 h-3" />;
    return <FileText className="w-3 h-3" />;
  };

  const canSend = (message.trim().length > 0 || attachments.length > 0) && !isLoading && !disabled;

  return (
    <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--surface)]">
      {/* Quick commands */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd.label}
            onClick={() => handleQuickCommand(cmd.text)}
            disabled={isLoading || disabled}
            className="px-2.5 py-1 rounded-full text-xs bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-3)] hover:border-[var(--border)] hover:text-[var(--text-3)] transition-colors disabled:opacity-40"
          >
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-3)] hover:border-[var(--accent-border)] hover:text-[var(--accent-text)] max-w-[200px]"
            >
              <span className="text-[var(--accent)]">{getFileIcon(att.type)}</span>
              <span className="truncate">{att.name}</span>
              <button
                onClick={() => removeAttachment(idx)}
                className="shrink-0 text-[var(--text-3)] hover:text-[var(--danger)] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <div className="mb-2 px-3 py-2 rounded bg-red-950/30 border border-red-800/40 text-xs text-[var(--danger)]">
          {uploadError}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* File upload button */}
        <label className={`shrink-0 p-2.5 rounded-lg border border-[var(--border)] cursor-pointer transition-colors ${
          isUploading
            ? 'bg-[var(--accent)]/20 border-blue-700/30 text-[var(--accent)]'
            : 'bg-[var(--surface-2)] text-[var(--text-3)] hover:border-[var(--border)] hover:text-[var(--text-3)]'
        } ${disabled || isLoading ? 'opacity-40 pointer-events-none' : ''}`}>
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Paperclip className="w-4 h-4" />
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.txt,.csv"
            multiple
            onChange={handleFileSelect}
            disabled={disabled || isLoading}
          />
        </label>

        {/* Textarea */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            rows={1}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] placeholder:text-[var(--border)] resize-none focus:outline-none focus:border-blue-700/50 focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors disabled:opacity-50 leading-relaxed"
            style={{ minHeight: '44px', maxHeight: '200px' }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`shrink-0 p-2.5 rounded-lg transition-all ${
            canSend
              ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text)] shadow-lg shadow-blue-600/20'
              : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--border)]'
          } disabled:cursor-not-allowed`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      <div className="mt-2 text-xs text-[var(--text-4)] text-center">
        Press Enter to send • Shift+Enter for new line
      </div>
    </div>
  );
}
