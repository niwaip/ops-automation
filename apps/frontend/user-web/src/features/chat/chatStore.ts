import { create } from 'zustand';
import type { ChatSession } from '@ops/user-core';
import { createChatSessionId } from './lib/session';

export type ChatMode = 'chat' | 'task';

export interface ChatStoreState {
  currentSession: ChatSession | null;
  isOpen: boolean;
  chatMode: ChatMode;
  draftMessage: string;
  draftExecutionId: string | null;
  createSession: () => ChatSession;
  setCurrentSession: (session: ChatSession | null) => void;
  setOpen: (isOpen: boolean) => void;
  setChatMode: (mode: ChatMode) => void;
  setDraftMessage: (message: string) => void;
  setDraftExecutionId: (executionId: string | null) => void;
  openWithPrompt: (message: string, mode?: ChatMode, executionId?: string | null) => void;
  clearDraftContext: () => void;
}

export const useChatStore = create<ChatStoreState>((set) => ({
  currentSession: null,
  isOpen: false,
  chatMode: 'task',
  draftMessage: '',
  draftExecutionId: null,
  createSession: () => {
    const now = new Date().toISOString();
    const nextSession: ChatSession = {
      id: createChatSessionId(),
      title: '新对话',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    set({
      currentSession: nextSession,
      draftExecutionId: null,
    });
    return nextSession;
  },
  setCurrentSession: (currentSession) => set({ currentSession }),
  setOpen: (isOpen) => set({ isOpen }),
  setChatMode: (chatMode) => set({ chatMode }),
  setDraftMessage: (draftMessage) => set({ draftMessage }),
  setDraftExecutionId: (draftExecutionId) => set({ draftExecutionId }),
  openWithPrompt: (draftMessage, chatMode = 'task', draftExecutionId = null) =>
    set({
      isOpen: true,
      draftMessage,
      chatMode,
      draftExecutionId,
    }),
  clearDraftContext: () =>
    set({
      draftMessage: '',
      draftExecutionId: null,
      chatMode: 'task',
    }),
}));
