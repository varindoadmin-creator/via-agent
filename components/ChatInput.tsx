'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, X, Loader2, Image, FileText, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Attachment } from '@/types/chat';
import { normalizeVoiceCommand, type VoicePendingAction } from '@/lib/ai/voiceCommands';

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface ChatInputProps {
  onSend: (message: string, attachments: Attachment[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  pendingAction?: VoicePendingAction;
  voiceReplies?: boolean;
  onToggleVoiceReplies?: () => void;
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
  pendingAction = null,
  voiceReplies = false,
  onToggleVoiceReplies,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceBaseMessageRef = useRef('');
  const finalTranscriptRef = useRef('');
  const latestTranscriptRef = useRef('');
  const voiceSubmittedRef = useRef(false);

  useEffect(() => {
    setVoiceSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => recognitionRef.current?.abort();
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed && attachments.length === 0) return;
    if (isLoading || disabled) return;

    if (recognitionRef.current) {
      voiceSubmittedRef.current = true;
      recognitionRef.current.stop();
    }
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

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition || isLoading || disabled) return;

    setVoiceError(null);
    voiceBaseMessageRef.current = message.trim();
    finalTranscriptRef.current = '';
    latestTranscriptRef.current = '';
    voiceSubmittedRef.current = false;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'id-ID';

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalTranscriptRef.current += transcript + ' ';
        else interim += transcript;
      }

      const spoken = `${finalTranscriptRef.current}${interim}`.trim();
      latestTranscriptRef.current = spoken;
      const prefix = voiceBaseMessageRef.current;
      setMessage([prefix, spoken].filter(Boolean).join(prefix && spoken ? ' ' : ''));
    };

    recognition.onerror = (event) => {
      const friendlyMessage = event.error === 'not-allowed'
        ? 'Microphone permission was denied. Allow microphone access in the browser and try again.'
        : event.error === 'no-speech'
          ? 'No speech was detected. Please try again.'
          : `Voice input stopped: ${event.error}.`;
      setVoiceError(friendlyMessage);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      const command = normalizeVoiceCommand(
        finalTranscriptRef.current.trim() || latestTranscriptRef.current,
        pendingAction
      );
      if (command && !voiceSubmittedRef.current) {
        voiceSubmittedRef.current = true;
        setMessage('');
        onSend(command, []);
      } else {
        window.setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceError('Voice input could not start. Please try again.');
    }
  }, [disabled, isLoading, message, onSend, pendingAction]);

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
        <div className="mb-2 px-3 py-2 rounded bg-red-50 border border-red-200 text-xs text-[var(--danger)]">
          {uploadError}
        </div>
      )}

      {voiceError && (
        <div className="mb-2 px-3 py-2 rounded bg-red-50 border border-red-200 text-xs text-[var(--danger)]">
          {voiceError}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* File upload button */}
        <label className={`shrink-0 p-2.5 rounded-lg border border-[var(--border)] cursor-pointer transition-colors ${
          isUploading
            ? 'bg-[var(--accent-light)] border-[var(--accent-border)] text-[var(--accent)]'
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

        {/* Voice input button — transcription is reviewed before sending */}
        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          disabled={!voiceSupported || disabled || isLoading}
          className={`shrink-0 p-2.5 rounded-lg border transition-colors ${
            isListening
              ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
              : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-3)] hover:border-[var(--accent-border)] hover:text-[var(--accent)]'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={voiceSupported ? (isListening ? 'Stop voice input' : 'Start voice input') : 'Voice input is not supported in this browser'}
          aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          aria-pressed={isListening}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

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
            className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] placeholder:text-[var(--text-4)] resize-none focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-light)] transition-colors disabled:opacity-50 leading-relaxed"
            style={{ minHeight: '44px', maxHeight: '200px' }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`shrink-0 p-2.5 rounded-lg transition-all ${
            canSend
              ? 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-sm'
              : 'bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-4)]'
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
        {isListening
          ? 'Listening… speak naturally, then pause; VIA will submit the transcript'
          : 'Press Enter to send • Shift+Enter for new line • Say “Hello VIA…” or “Hello Varindo…” after tapping the microphone'}
      </div>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={onToggleVoiceReplies}
          disabled={!onToggleVoiceReplies}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            voiceReplies
              ? 'border-[var(--accent-border)] bg-[var(--accent-light)] text-[var(--accent)]'
              : 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]'
          } disabled:opacity-40`}
          aria-pressed={voiceReplies}
          aria-label={`Voice replies ${voiceReplies ? 'on' : 'off'}. Click to turn ${voiceReplies ? 'off' : 'on'}.`}
        >
          {voiceReplies ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          Voice replies: {voiceReplies ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}
