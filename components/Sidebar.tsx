'use client';

import React from 'react';
import {
  Plus,
  MessageSquare,
  Settings,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Cpu,
  Database,
} from 'lucide-react';
import { Conversation } from '@/types/chat';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMockMode: boolean;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export default function Sidebar({
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  isCollapsed,
  onToggleCollapse,
  isMockMode,
}: SidebarProps) {
  return (
    <div
      className={`flex flex-col h-full border-r border-[#1e2130] bg-[#0d0e14] transition-all duration-200 ${
        isCollapsed ? 'w-14' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-[#1e2130]">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-blue-600/20 border border-blue-700/30 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#f1f5f9] tracking-wide">VIA</div>
              <div className="text-[9px] text-[#475569] tracking-widest uppercase">Varindo Agent</div>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="w-7 h-7 rounded-md bg-blue-600/20 border border-blue-700/30 flex items-center justify-center mx-auto">
            <Cpu className="w-4 h-4 text-blue-400" />
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded text-[#475569] hover:text-[#94a3b8] hover:bg-[#1a1d24] transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* New conversation button */}
      <div className="p-2">
        <button
          onClick={onNewConversation}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-blue-600/15 border border-blue-700/20 text-blue-400 hover:bg-blue-600/25 transition-colors text-sm font-medium ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'New conversation' : undefined}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto py-1 space-y-0.5 px-1">
        {conversations.length === 0 && !isCollapsed && (
          <div className="px-3 py-8 text-center">
            <MessageSquare className="w-8 h-8 text-[#1e2130] mx-auto mb-2" />
            <div className="text-xs text-[#2d3348]">No conversations yet</div>
          </div>
        )}

        {conversations.map((conv) => {
          const isActive = conv.id === activeConversationId;
          return (
            <div
              key={conv.id}
              className={`group flex items-center gap-2 rounded-lg cursor-pointer transition-colors ${
                isCollapsed ? 'px-2 py-2 justify-center' : 'px-2 py-2'
              } ${
                isActive
                  ? 'bg-blue-600/15 border border-blue-700/20'
                  : 'hover:bg-[#1a1d24] border border-transparent'
              }`}
              onClick={() => onSelectConversation(conv.id)}
              title={isCollapsed ? conv.title : undefined}
            >
              <MessageSquare
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-blue-400' : 'text-[#475569]'
                }`}
              />

              {!isCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-xs font-medium truncate ${
                        isActive ? 'text-blue-300' : 'text-[#94a3b8]'
                      }`}
                    >
                      {truncate(conv.title, 26)}
                    </div>
                    <div className="text-[10px] text-[#2d3348]">
                      {new Date(conv.updatedAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded text-[#475569] hover:text-red-400 transition-all"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className={`p-3 border-t border-[#1e2130] space-y-1`}>
        {/* Mock mode indicator */}
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded ${
            isCollapsed ? 'justify-center' : ''
          } ${
            isMockMode
              ? 'bg-amber-950/20 border border-amber-800/30'
              : 'bg-green-950/20 border border-green-800/30'
          }`}
          title={isMockMode ? 'Mock Mode — using simulated data' : 'Connected to Zoho Books'}
        >
          <Database
            className={`w-3.5 h-3.5 shrink-0 ${
              isMockMode ? 'text-amber-400' : 'text-green-400'
            }`}
          />
          {!isCollapsed && (
            <span
              className={`text-xs ${
                isMockMode ? 'text-amber-300' : 'text-green-300'
              }`}
            >
              {isMockMode ? 'Mock Mode' : 'Zoho Live'}
            </span>
          )}
        </div>

        {/* Settings (placeholder) */}
        <button
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[#475569] hover:text-[#94a3b8] hover:bg-[#1a1d24] transition-colors text-xs ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Settings' : undefined}
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          {!isCollapsed && <span>Settings</span>}
        </button>
      </div>
    </div>
  );
}
