'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bug, RefreshCw, AlertCircle, Sparkles, Volume2, VolumeX } from 'lucide-react';

import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

import { ChatMessage as ChatMessageType, Conversation, Attachment, PendingAction } from '@/types/chat';
import { SOPreview } from '@/types/order';
import { choosePreferredVoice, textForSpeech } from '@/lib/ai/speech';

// Simple UUID generator (no external dependency)
function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function generateConversationTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/[^\w\s]/g, ' ').trim();
  const words = clean.split(/\s+/).slice(0, 6);
  return words.join(' ') || 'New Conversation';
}

const WELCOME_MESSAGE: ChatMessageType = {
  id: 'welcome',
  role: 'assistant',
  type: 'text',
  content: 'Hello, sir. What can I do for you today?',
  timestamp: new Date(),
};

interface ChatInterfaceProps {
  apiEndpoint?: string;
  assistantName?: string;
  welcomeMessage?: string;
}

export default function ChatInterface({
  apiEndpoint = '/api/chat',
  assistantName = 'VIA',
  welcomeMessage = WELCOME_MESSAGE.content,
}: ChatInterfaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isMockMode, setIsMockMode] = useState(true);
  const [voiceReplies, setVoiceReplies] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const voiceRepliesRef = useRef(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAudioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const enabled = window.localStorage.getItem('via-voice-replies') === 'true';
    voiceRepliesRef.current = enabled;
    setVoiceReplies(enabled);
    return () => {
      window.speechSynthesis?.cancel();
      voiceAudioRef.current?.pause();
      if (voiceAudioUrlRef.current) URL.revokeObjectURL(voiceAudioUrlRef.current);
    };
  }, []);

  const speakWithBrowserFallback = useCallback((content: string) => {
    if (!('speechSynthesis' in window)) return;
    const spokenText = textForSpeech(content);
    if (!spokenText) return;

    const utterance = new SpeechSynthesisUtterance(spokenText);
    const preferredVoice = choosePreferredVoice(window.speechSynthesis.getVoices());
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    } else {
      utterance.lang = 'id-ID';
    }
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const speakReply = useCallback(async (content: string) => {
    if (!voiceRepliesRef.current) return;
    const spokenText = textForSpeech(content);
    if (!spokenText) return;

    window.speechSynthesis?.cancel();
    voiceAudioRef.current?.pause();
    if (voiceAudioUrlRef.current) {
      URL.revokeObjectURL(voiceAudioUrlRef.current);
      voiceAudioUrlRef.current = null;
    }

    try {
      const response = await fetch('/api/voice/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spokenText }),
      });
      if (!response.ok) throw new Error('Natural voice unavailable');
      const blob = await response.blob();
      if (!voiceRepliesRef.current) return;

      const url = URL.createObjectURL(blob);
      voiceAudioUrlRef.current = url;
      const audio = new Audio(url);
      voiceAudioRef.current = audio;
      const release = () => {
        if (voiceAudioUrlRef.current === url) {
          URL.revokeObjectURL(url);
          voiceAudioUrlRef.current = null;
          voiceAudioRef.current = null;
        }
      };
      audio.addEventListener('ended', release, { once: true });
      audio.addEventListener('error', release, { once: true });
      await audio.play();
    } catch {
      if (voiceRepliesRef.current) speakWithBrowserFallback(spokenText);
    }
  }, [speakWithBrowserFallback]);

  const toggleVoiceReplies = useCallback(() => {
    setVoiceReplies((current) => {
      const next = !current;
      voiceRepliesRef.current = next;
      window.localStorage.setItem('via-voice-replies', String(next));
      if (!next) {
        window.speechSynthesis?.cancel();
        voiceAudioRef.current?.pause();
      }
      return next;
    });
  }, []);

  // Detect mock mode
  useEffect(() => {
    fetch('/api/zoho/customers?q=test')
      .then((r) => r.json())
      .then((data) => {
        // If we get data back (even empty), we're connected
        setIsMockMode(Boolean(process.env.NEXT_PUBLIC_MOCK_MODE !== 'false'));
      })
      .catch(() => setIsMockMode(true));
    // Check env
    setIsMockMode(true); // Default to mock for display
  }, []);

  // Initialize with a default conversation
  useEffect(() => {
    const defaultConv: Conversation = {
      id: generateId(),
      title: 'Welcome',
      messages: [{ ...WELCOME_MESSAGE, content: welcomeMessage }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setConversations([defaultConv]);
    setActiveConversationId(defaultConv.id);
  }, [welcomeMessage]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConversationId]);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  const addMessage = useCallback(
    (convId: string, message: ChatMessageType) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: new Date(),
                title:
                  c.title === 'New Conversation' && message.role === 'user'
                    ? generateConversationTitle(message.content)
                    : c.title,
              }
            : c
        )
      );
    },
    []
  );

  const updateLastMessage = useCallback(
    (convId: string, updates: Partial<ChatMessageType>) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          const messages = [...c.messages];
          const lastIdx = messages.length - 1;
          if (lastIdx >= 0) {
            messages[lastIdx] = { ...messages[lastIdx], ...updates };
          }
          return { ...c, messages };
        })
      );
    },
    []
  );

  const handleSend = useCallback(
    async (message: string, attachments: Attachment[]) => {
      if (!activeConversationId) return;
      if (!message.trim() && attachments.length === 0) return;

      setError(null);

      // Add user message
      const userMsg: ChatMessageType = {
        id: generateId(),
        role: 'user',
        type: 'text',
        content: message,
        timestamp: new Date(),
        attachments: attachments.length > 0 ? attachments : undefined,
      };
      addMessage(activeConversationId, userMsg);

      // Add loading placeholder
      const loadingMsg: ChatMessageType = {
        id: generateId(),
        role: 'assistant',
        type: 'text',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      };
      addMessage(activeConversationId, loadingMsg);
      setIsLoading(true);

      try {
        // Get conversation history (last 10 exchanges)
        const currentConv = conversations.find((c) => c.id === activeConversationId);
        const history = (currentConv?.messages || [])
          .filter((m) => !m.isLoading && m.id !== 'welcome')
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            conversationId: activeConversationId,
            attachments: attachments.length > 0 ? attachments : undefined,
            history,
            pendingAction: pendingAction || undefined,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || data.message || 'Request failed');
        }

        // Update loading message with actual response
        updateLastMessage(activeConversationId, {
          id: generateId(),
          content: data.message,
          type: data.type,
          metadata: data.metadata,
          isLoading: false,
          isError: data.type === 'error',
        });
        if (data.type !== 'error') speakReply(data.message);

        // Handle pending action state
        if (data.type === 'so_preview') {
          setPendingAction({
            type: 'create_so',
            data: data.metadata?.previewData as SOPreview,
            previewShown: true,
          });
        } else if (data.type === 'so_update_preview') {
          setPendingAction({
            type: 'update_so',
            data: {
              soId: (data.metadata?.zohoData as { salesorder_id?: string })?.salesorder_id || '',
              preview: data.metadata?.previewData as SOPreview,
            },
            previewShown: true,
          });
        } else if (data.type === 'action_result') {
          // Clear pending action after successful execution
          setPendingAction(null);
        } else if (data.type === 'error') {
          // Keep pending action on error
        } else {
          // For other message types, clear pending action
          if (
            !message.includes('APPROVE CREATE SO') &&
            !message.includes('APPROVE UPDATE SO')
          ) {
            setPendingAction(null);
          }
        }
      } catch (err) {
        const errorText = err instanceof Error ? err.message : 'Something went wrong';
        setError(errorText);
        updateLastMessage(activeConversationId, {
          content: `❌ Error: ${errorText}`,
          isLoading: false,
          isError: true,
          type: 'error',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [activeConversationId, conversations, pendingAction, addMessage, updateLastMessage, speakReply, apiEndpoint]
  );

  const handleNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: generateId(),
      title: 'New Conversation',
      messages: [{ ...WELCOME_MESSAGE, id: generateId(), content: welcomeMessage }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setPendingAction(null);
    setError(null);
  }, [welcomeMessage]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setPendingAction(null);
    setError(null);
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      setActiveConversationId(remaining[0]?.id || null);
    }
  }, [activeConversationId, conversations]);

  const handleClearConversation = useCallback(() => {
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? {
              ...c,
              messages: [{ ...WELCOME_MESSAGE, id: generateId(), content: welcomeMessage }],
              updatedAt: new Date(),
              title: 'New Conversation',
            }
          : c
      )
    );
    setPendingAction(null);
    setError(null);
  }, [activeConversationId, welcomeMessage]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)", height: "100vh" }}>
      {/* Sidebar */}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-sm font-semibold text-[var(--text)]">
                {activeConversation?.title || assistantName}
              </h1>
              <div className="text-xs text-[var(--text-3)]">
                {activeConversation?.messages.filter(m => !m.isLoading).length || 0} messages
                {pendingAction && (
                  <span className="ml-2 text-amber-700">
                    ⏳ Awaiting: {pendingAction.type === 'create_so' ? 'APPROVE CREATE SO' : 'APPROVE UPDATE SO'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleVoiceReplies}
              className={`p-1.5 rounded-md text-xs transition-colors flex items-center gap-1.5 ${
                voiceReplies
                  ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-3)] hover:bg-[var(--surface-3)]'
              }`}
              title={voiceReplies ? 'Turn voice replies off' : 'Turn voice replies on'}
              aria-label={voiceReplies ? 'Turn voice replies off' : 'Turn voice replies on'}
              aria-pressed={voiceReplies}
            >
              {voiceReplies ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{voiceReplies ? 'Natural voice on' : 'Voice off'}</span>
            </button>

            {/* Debug toggle */}
            <button
              onClick={() => setShowDebug(!showDebug)}
              className={`p-1.5 rounded-md text-xs transition-colors flex items-center gap-1 ${
                showDebug
                  ? 'bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent-border)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-3)] hover:bg-[var(--surface-3)]'
              }`}
              title="Toggle debug panel"
            >
              <Bug className="w-3.5 h-3.5" />
              {showDebug && <span>Debug ON</span>}
            </button>

            {/* Clear conversation */}
            <button
              onClick={handleClearConversation}
              className="p-1.5 rounded-md text-[var(--text-3)] hover:text-[var(--text-3)] hover:bg-[var(--surface-3)] transition-colors"
              title="Clear conversation"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Pending action banner */}
        {pendingAction && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
            <div className="flex items-center gap-2 text-xs text-amber-800">
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                Pending action:{' '}
                <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">
                  {pendingAction.type === 'create_so' ? 'APPROVE CREATE SO' : 'APPROVE UPDATE SO'}
                </code>{' '}
                — Type the exact command to proceed, or continue chatting to cancel.
              </span>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 shrink-0">
            <div className="flex items-center gap-2 text-xs text-[var(--danger)]">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Messages */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto scroll-smooth"
        >
          {activeConversation?.messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-[var(--text-4)]">
                <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <div className="text-sm">Start a conversation</div>
              </div>
            </div>
          ) : (
            <>
              {activeConversation?.messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  showDebug={showDebug}
                  assistantName={assistantName}
                />
              ))}
              <div ref={messagesEndRef} className="h-4" />
            </>
          )}
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          disabled={!activeConversationId}
          pendingAction={pendingAction?.type || null}
          voiceReplies={voiceReplies}
          onToggleVoiceReplies={toggleVoiceReplies}
        />
      </div>
    </div>
  );
}
